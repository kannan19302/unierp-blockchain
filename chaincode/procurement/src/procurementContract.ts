/**
 * ProcurementLifecycleContract — Hyperledger Fabric Chaincode
 *
 * Smart contract managing the full PO lifecycle with automated
 * 3-way matching (PO ↔ Receipt ↔ Invoice).
 *
 * When all three match within tolerance, the contract marks the
 * PO as PAYMENT_AUTHORIZED — the NestJS service polls this status
 * to trigger actual payment in PostgreSQL/banking integration.
 *
 * Deployed on: procurement-channel
 * Chaincode name: procurement-lifecycle
 */

import { Context, Contract, Info, Returns, Transaction } from 'fabric-contract-api';

type PurchaseOrderStatus =
  | 'DRAFT'
  | 'VENDOR_ACCEPTED'
  | 'GOODS_RECEIVED'
  | 'INVOICE_RECEIVED'
  | 'MATCH_PASSED'
  | 'MATCH_FAILED'
  | 'PAYMENT_AUTHORIZED'
  | 'PAID'
  | 'DISPUTED';

export interface PurchaseOrderRecord {
  docType: 'PurchaseOrder';
  poId: string;
  tenantId: string;
  vendorId: string;
  buyerOrgId: string;
  lines: Array<{
    lineId: string;
    productId: string;
    quantity: number;
    unitPrice: string;
    unit: string;
  }>;
  totalAmount: string;
  currency: string;
  deliveryDate: string;
  terms: string;
  status: PurchaseOrderStatus;
  vendorAcceptance?: {
    acceptedAt: string;
    acceptedBy: string;
    notes?: string;
    txId: string;
  };
  goodsReceipt?: {
    receiptId: string;
    receivedLines: Array<{
      lineId: string;
      receivedQuantity: number;
      conditionNotes?: string;
    }>;
    receivedAt: string;
    receivedBy: string;
    txId: string;
  };
  invoice?: {
    invoiceId: string;
    invoiceNumber: string;
    invoiceAmount: string;
    invoiceDate: string;
    dueDate: string;
    submittedBy: string;
    txId: string;
  };
  matchResult?: {
    matched: boolean;
    matchResult: 'FULL_MATCH' | 'PARTIAL_MATCH' | 'MISMATCH';
    details: string;
    paymentAuthorized: boolean;
    matchedAt: string;
    txId: string;
  };
  createdBy: string;
  createdAt: string;
  txId: string;
}

const MATCH_TOLERANCE = 0.02; // 2% tolerance for quantity/amount matching

@Info({
  title: 'ProcurementLifecycleContract',
  description:
    'UniERP Procurement Smart Contract — automated 3-way PO/Receipt/Invoice matching with payment authorization.',
})
export class ProcurementLifecycleContract extends Contract {
  constructor() {
    super('ProcurementLifecycleContract');
  }

  @Transaction()
  async InitLedger(_ctx: Context): Promise<void> {}

  /**
   * CreatePurchaseOrder — record a new PO on the blockchain.
   */
  @Transaction()
  @Returns('string')
  async CreatePurchaseOrder(ctx: Context, argsJson: string): Promise<string> {
    const args = JSON.parse(argsJson) as {
      tenantId: string;
      poId: string;
      vendorId: string;
      buyerOrgId: string;
      lines: PurchaseOrderRecord['lines'];
      totalAmount: string;
      currency: string;
      deliveryDate: string;
      terms: string;
      createdBy: string;
      createdAt: string;
    };

    const key = `PO~${args.tenantId}~${args.poId}`;
    const existing = await ctx.stub.getState(key);
    if (existing && existing.length > 0) {
      return existing.toString('utf8');
    }

    const txId = ctx.stub.getTxID();
    const record: PurchaseOrderRecord = {
      docType: 'PurchaseOrder',
      poId: args.poId,
      tenantId: args.tenantId,
      vendorId: args.vendorId,
      buyerOrgId: args.buyerOrgId,
      lines: args.lines,
      totalAmount: args.totalAmount,
      currency: args.currency,
      deliveryDate: args.deliveryDate,
      terms: args.terms,
      status: 'DRAFT',
      createdBy: args.createdBy,
      createdAt: args.createdAt,
      txId,
    };

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)));
    await ctx.stub.setEvent('PurchaseOrderCreated', Buffer.from(JSON.stringify({
      tenantId: args.tenantId, poId: args.poId, txId,
    })));

    return JSON.stringify(record);
  }

  /**
   * AcceptPurchaseOrder — vendor acknowledges and accepts the PO.
   */
  @Transaction()
  @Returns('string')
  async AcceptPurchaseOrder(ctx: Context, argsJson: string): Promise<string> {
    const args = JSON.parse(argsJson) as {
      tenantId: string;
      poId: string;
      vendorId: string;
      acceptedAt: string;
      acceptedBy: string;
      notes?: string;
    };

    const record = await this.getPoRecord(ctx, args.tenantId, args.poId);
    const txId = ctx.stub.getTxID();

    record.vendorAcceptance = {
      acceptedAt: args.acceptedAt,
      acceptedBy: args.acceptedBy,
      notes: args.notes,
      txId,
    };
    record.status = 'VENDOR_ACCEPTED';

    await this.savePoRecord(ctx, record);
    await ctx.stub.setEvent('PurchaseOrderAccepted', Buffer.from(JSON.stringify({
      tenantId: args.tenantId, poId: args.poId, txId,
    })));

    return JSON.stringify(record);
  }

  /**
   * ConfirmGoodsReceipt — record that goods have been received.
   */
  @Transaction()
  @Returns('string')
  async ConfirmGoodsReceipt(ctx: Context, argsJson: string): Promise<string> {
    const args = JSON.parse(argsJson) as {
      tenantId: string;
      poId: string;
      receiptId: string;
      receivedLines: Array<{ lineId: string; receivedQuantity: number; conditionNotes?: string }>;
      receivedAt: string;
      receivedBy: string;
    };

    const record = await this.getPoRecord(ctx, args.tenantId, args.poId);
    const txId = ctx.stub.getTxID();

    record.goodsReceipt = {
      receiptId: args.receiptId,
      receivedLines: args.receivedLines,
      receivedAt: args.receivedAt,
      receivedBy: args.receivedBy,
      txId,
    };
    record.status = 'GOODS_RECEIVED';

    await this.savePoRecord(ctx, record);
    await ctx.stub.setEvent('GoodsReceiptConfirmed', Buffer.from(JSON.stringify({
      tenantId: args.tenantId, poId: args.poId, receiptId: args.receiptId, txId,
    })));

    return JSON.stringify(record);
  }

  /**
   * SubmitInvoice — vendor submits an invoice against the PO.
   */
  @Transaction()
  @Returns('string')
  async SubmitInvoice(ctx: Context, argsJson: string): Promise<string> {
    const args = JSON.parse(argsJson) as {
      tenantId: string;
      poId: string;
      invoiceId: string;
      invoiceNumber: string;
      invoiceAmount: string;
      currency: string;
      invoiceDate: string;
      dueDate: string;
      submittedBy: string;
    };

    const record = await this.getPoRecord(ctx, args.tenantId, args.poId);
    const txId = ctx.stub.getTxID();

    record.invoice = {
      invoiceId: args.invoiceId,
      invoiceNumber: args.invoiceNumber,
      invoiceAmount: args.invoiceAmount,
      invoiceDate: args.invoiceDate,
      dueDate: args.dueDate,
      submittedBy: args.submittedBy,
      txId,
    };
    record.status = 'INVOICE_RECEIVED';

    await this.savePoRecord(ctx, record);
    await ctx.stub.setEvent('InvoiceSubmitted', Buffer.from(JSON.stringify({
      tenantId: args.tenantId, poId: args.poId, invoiceId: args.invoiceId, txId,
    })));

    return JSON.stringify(record);
  }

  /**
   * ExecuteThreeWayMatch — automated matching of PO ↔ Receipt ↔ Invoice.
   *
   * Returns match result and whether payment is authorized.
   * This is the core smart contract value — automated, tamper-proof matching.
   */
  @Transaction()
  @Returns('string')
  async ExecuteThreeWayMatch(
    ctx: Context,
    tenantId: string,
    poId: string,
  ): Promise<string> {
    const record = await this.getPoRecord(ctx, tenantId, poId);
    const txId = ctx.stub.getTxID();

    if (!record.goodsReceipt || !record.invoice) {
      throw new Error(
        'Cannot execute 3-way match: both goods receipt and invoice must be submitted first.',
      );
    }

    const poTotal = parseFloat(record.totalAmount);
    const invoiceTotal = parseFloat(record.invoice.invoiceAmount);
    const amountDiff = Math.abs(poTotal - invoiceTotal) / poTotal;

    // Check quantity match for each line
    let quantityMismatch = false;
    const mismatchDetails: string[] = [];

    for (const poLine of record.lines) {
      const receivedLine = record.goodsReceipt.receivedLines.find(
        (r) => r.lineId === poLine.lineId,
      );
      if (!receivedLine) {
        quantityMismatch = true;
        mismatchDetails.push(`Line ${poLine.lineId}: not received`);
        continue;
      }

      const qtyDiff = Math.abs(poLine.quantity - receivedLine.receivedQuantity) / poLine.quantity;
      if (qtyDiff > MATCH_TOLERANCE) {
        quantityMismatch = true;
        mismatchDetails.push(
          `Line ${poLine.lineId}: ordered ${poLine.quantity} vs received ${receivedLine.receivedQuantity}`,
        );
      }
    }

    const amountMatched = amountDiff <= MATCH_TOLERANCE;
    const quantityMatched = !quantityMismatch;

    let matchResult: 'FULL_MATCH' | 'PARTIAL_MATCH' | 'MISMATCH';
    let paymentAuthorized: boolean;
    let details: string;

    if (amountMatched && quantityMatched) {
      matchResult = 'FULL_MATCH';
      paymentAuthorized = true;
      details = 'All quantities and amounts match within tolerance';
    } else if (!amountMatched && !quantityMatched) {
      matchResult = 'MISMATCH';
      paymentAuthorized = false;
      details = `Amount diff: ${(amountDiff * 100).toFixed(2)}%. Quantity issues: ${mismatchDetails.join('; ')}`;
    } else {
      matchResult = 'PARTIAL_MATCH';
      paymentAuthorized = false;
      details = mismatchDetails.length > 0
        ? `Quantity issues: ${mismatchDetails.join('; ')}`
        : `Amount diff: ${(amountDiff * 100).toFixed(2)}%`;
    }

    record.matchResult = {
      matched: paymentAuthorized,
      matchResult,
      details,
      paymentAuthorized,
      matchedAt: new Date().toISOString(),
      txId,
    };

    record.status = paymentAuthorized ? 'PAYMENT_AUTHORIZED' : 'MATCH_FAILED';

    await this.savePoRecord(ctx, record);

    const result = { matched: paymentAuthorized, matchResult, details, paymentAuthorized };

    await ctx.stub.setEvent('ThreeWayMatchExecuted', Buffer.from(JSON.stringify({
      tenantId, poId, matchResult, paymentAuthorized, txId,
    })));

    return JSON.stringify(result);
  }

  /**
   * GetPurchaseOrderHistory — retrieve the full PO on-chain record.
   */
  @Transaction(false)
  @Returns('string')
  async GetPurchaseOrderHistory(
    ctx: Context,
    tenantId: string,
    poId: string,
  ): Promise<string> {
    const key = `PO~${tenantId}~${poId}`;
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) return '[]';
    return `[${data.toString('utf8')}]`;
  }

  private async getPoRecord(ctx: Context, tenantId: string, poId: string): Promise<PurchaseOrderRecord> {
    const key = `PO~${tenantId}~${poId}`;
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) {
      throw new Error(`Purchase Order ${poId} not found on ledger`);
    }
    return JSON.parse(data.toString('utf8')) as PurchaseOrderRecord;
  }

  private async savePoRecord(ctx: Context, record: PurchaseOrderRecord): Promise<void> {
    const key = `PO~${record.tenantId}~${record.poId}`;
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)));
  }
}

export const contracts = [ProcurementLifecycleContract];
