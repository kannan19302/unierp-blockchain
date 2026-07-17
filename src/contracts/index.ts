/**
 * Blockchain Contract TypeScript Interfaces
 *
 * Typed wrappers around the raw Fabric Contract API.
 * Each interface describes the chaincode functions available,
 * their argument shapes, and return types.
 *
 * These are used by the NestJS blockchain service layer to
 * submit and query transactions in a type-safe way.
 */

import { Contract } from '@hyperledger/fabric-gateway';
import { OnChainRecord } from '../dto/blockchain-transaction.dto';

// ──────────────────────────────────────────────────────────────
// Base contract wrapper
// ──────────────────────────────────────────────────────────────

/**
 * Wraps a raw Fabric Contract with typed submit/evaluate helpers.
 */
export class TypedContract {
  constructor(protected readonly contract: Contract) {}

  protected async submitTransaction(
    fcn: string,
    ...args: string[]
  ): Promise<string> {
    const result = await this.contract.submitTransaction(fcn, ...args);
    return Buffer.from(result).toString('utf8');
  }

  protected async evaluateTransaction(
    fcn: string,
    ...args: string[]
  ): Promise<string> {
    const result = await this.contract.evaluateTransaction(fcn, ...args);
    return Buffer.from(result).toString('utf8');
  }

  protected parseResult<T>(result: string): T {
    return JSON.parse(result) as T;
  }
}

// ──────────────────────────────────────────────────────────────
// Document Registry Contract
// ──────────────────────────────────────────────────────────────

export interface DocumentRegistryArgs {
  register: {
    tenantId: string;
    documentId: string;
    documentHash: string;
    documentType: string;
    fileName: string;
    uploadedBy: string;
    uploadedAt: string;
    fileSize: number;
    mimeType: string;
  };
  revoke: {
    tenantId: string;
    documentId: string;
    revokedBy: string;
    reason: string;
  };
}

export class DocumentRegistryContract extends TypedContract {
  /**
   * Register a document hash on the blockchain.
   * Idempotent — re-registering the same documentId with same hash is a no-op.
   */
  async registerDocument(args: DocumentRegistryArgs['register']): Promise<OnChainRecord> {
    const result = await this.submitTransaction(
      'RegisterDocument',
      JSON.stringify(args),
    );
    return this.parseResult<OnChainRecord>(result);
  }

  /**
   * Verify a document's authenticity by comparing its hash against the ledger.
   * Returns the on-chain record if found, null if not registered.
   */
  async verifyDocument(tenantId: string, documentId: string): Promise<OnChainRecord | null> {
    const result = await this.evaluateTransaction(
      'VerifyDocument',
      tenantId,
      documentId,
    );
    if (!result || result === 'null') return null;
    return this.parseResult<OnChainRecord>(result);
  }

  /**
   * Revoke a document (marks as invalid, e.g., expired certificate).
   * Does NOT delete — immutable revocation record is added.
   */
  async revokeDocument(args: DocumentRegistryArgs['revoke']): Promise<OnChainRecord> {
    const result = await this.submitTransaction(
      'RevokeDocument',
      JSON.stringify(args),
    );
    return this.parseResult<OnChainRecord>(result);
  }

  /**
   * Get all documents registered by a tenant.
   */
  async getTenantDocuments(tenantId: string): Promise<OnChainRecord[]> {
    const result = await this.evaluateTransaction('GetTenantDocuments', tenantId);
    return this.parseResult<OnChainRecord[]>(result);
  }
}

// ──────────────────────────────────────────────────────────────
// Finance Ledger Contract
// ──────────────────────────────────────────────────────────────

export interface FinanceLedgerArgs {
  journalEntry: {
    tenantId: string;
    journalId: string;
    periodId: string;
    dataHash: string;
    totalDebit: string;
    totalCredit: string;
    currency: string;
    postedBy: string;
    postedAt: string;
    description: string;
  };
  periodClose: {
    tenantId: string;
    periodId: string;
    closedBy: string;
    closedAt: string;
    totalTransactions: number;
    openingBalance: string;
    closingBalance: string;
  };
  intercompanyNetting: {
    tenantId: string;
    nettingId: string;
    parties: string[];
    netAmount: string;
    currency: string;
    settledAt: string;
  };
}

export class FinanceLedgerContract extends TypedContract {
  async recordJournalEntry(args: FinanceLedgerArgs['journalEntry']): Promise<OnChainRecord> {
    const result = await this.submitTransaction(
      'RecordJournalEntry',
      JSON.stringify(args),
    );
    return this.parseResult<OnChainRecord>(result);
  }

  async verifyJournalEntry(tenantId: string, journalId: string): Promise<OnChainRecord | null> {
    const result = await this.evaluateTransaction('VerifyJournalEntry', tenantId, journalId);
    if (!result || result === 'null') return null;
    return this.parseResult<OnChainRecord>(result);
  }

  async attestPeriodClose(args: FinanceLedgerArgs['periodClose']): Promise<OnChainRecord> {
    const result = await this.submitTransaction(
      'AttestPeriodClose',
      JSON.stringify(args),
    );
    return this.parseResult<OnChainRecord>(result);
  }

  async getPeriodAttestation(tenantId: string, periodId: string): Promise<OnChainRecord | null> {
    const result = await this.evaluateTransaction('GetPeriodAttestation', tenantId, periodId);
    if (!result || result === 'null') return null;
    return this.parseResult<OnChainRecord>(result);
  }

  async recordIntercompanyNetting(args: FinanceLedgerArgs['intercompanyNetting']): Promise<OnChainRecord> {
    const result = await this.submitTransaction(
      'RecordIntercompanyNetting',
      JSON.stringify(args),
    );
    return this.parseResult<OnChainRecord>(result);
  }
}

// ──────────────────────────────────────────────────────────────
// Supply Chain Traceability Contract
// ──────────────────────────────────────────────────────────────

export interface SupplyChainArgs {
  shipment: {
    tenantId: string;
    shipmentId: string;
    asnId?: string;
    origin: { orgId: string; location: string; country: string };
    destination: { orgId: string; location: string; country: string };
    goods: Array<{ productId: string; batchId?: string; quantity: number; unit: string }>;
    expectedDelivery: string;
    createdBy: string;
    createdAt: string;
  };
  custody: {
    tenantId: string;
    shipmentId: string;
    fromOrg: string;
    toOrg: string;
    handoffAt: string;
    handoffLocation: string;
    signedBy: string;
  };
  checkpoint: {
    tenantId: string;
    shipmentId: string;
    location: string;
    coordinates?: { lat: number; lng: number };
    status: string;
    temperature?: number;
    humidity?: number;
    recordedAt: string;
    recordedBy: string;
  };
  recall: {
    tenantId: string;
    batchId: string;
    productId: string;
    reason: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    issuedBy: string;
    issuedAt: string;
  };
}

export class SupplyChainTraceabilityContract extends TypedContract {
  async recordShipment(args: SupplyChainArgs['shipment']): Promise<OnChainRecord> {
    const result = await this.submitTransaction('RecordShipment', JSON.stringify(args));
    return this.parseResult<OnChainRecord>(result);
  }

  async transferCustody(args: SupplyChainArgs['custody']): Promise<OnChainRecord> {
    const result = await this.submitTransaction('TransferCustody', JSON.stringify(args));
    return this.parseResult<OnChainRecord>(result);
  }

  async recordCheckpoint(args: SupplyChainArgs['checkpoint']): Promise<OnChainRecord> {
    const result = await this.submitTransaction('RecordCheckpoint', JSON.stringify(args));
    return this.parseResult<OnChainRecord>(result);
  }

  async verifyProvenance(tenantId: string, productId: string, batchId?: string): Promise<OnChainRecord[]> {
    const result = await this.evaluateTransaction(
      'VerifyProvenance',
      tenantId,
      productId,
      batchId ?? '',
    );
    return this.parseResult<OnChainRecord[]>(result);
  }

  async issueRecall(args: SupplyChainArgs['recall']): Promise<OnChainRecord> {
    const result = await this.submitTransaction('IssueRecall', JSON.stringify(args));
    return this.parseResult<OnChainRecord>(result);
  }

  async getShipmentHistory(tenantId: string, shipmentId: string): Promise<OnChainRecord[]> {
    const result = await this.evaluateTransaction('GetShipmentHistory', tenantId, shipmentId);
    return this.parseResult<OnChainRecord[]>(result);
  }
}

// ──────────────────────────────────────────────────────────────
// Procurement Lifecycle Contract
// ──────────────────────────────────────────────────────────────

export interface ProcurementArgs {
  purchaseOrder: {
    tenantId: string;
    poId: string;
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
    createdBy: string;
    createdAt: string;
  };
  vendorAcceptance: {
    tenantId: string;
    poId: string;
    vendorId: string;
    acceptedAt: string;
    acceptedBy: string;
    notes?: string;
  };
  goodsReceipt: {
    tenantId: string;
    poId: string;
    receiptId: string;
    receivedLines: Array<{
      lineId: string;
      receivedQuantity: number;
      conditionNotes?: string;
    }>;
    receivedAt: string;
    receivedBy: string;
  };
  invoice: {
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
}

export class ProcurementLifecycleContract extends TypedContract {
  async createPurchaseOrder(args: ProcurementArgs['purchaseOrder']): Promise<OnChainRecord> {
    const result = await this.submitTransaction('CreatePurchaseOrder', JSON.stringify(args));
    return this.parseResult<OnChainRecord>(result);
  }

  async acceptPurchaseOrder(args: ProcurementArgs['vendorAcceptance']): Promise<OnChainRecord> {
    const result = await this.submitTransaction('AcceptPurchaseOrder', JSON.stringify(args));
    return this.parseResult<OnChainRecord>(result);
  }

  async confirmGoodsReceipt(args: ProcurementArgs['goodsReceipt']): Promise<OnChainRecord> {
    const result = await this.submitTransaction('ConfirmGoodsReceipt', JSON.stringify(args));
    return this.parseResult<OnChainRecord>(result);
  }

  async submitInvoice(args: ProcurementArgs['invoice']): Promise<OnChainRecord> {
    const result = await this.submitTransaction('SubmitInvoice', JSON.stringify(args));
    return this.parseResult<OnChainRecord>(result);
  }

  async executeThreeWayMatch(tenantId: string, poId: string): Promise<{
    matched: boolean;
    matchResult: 'FULL_MATCH' | 'PARTIAL_MATCH' | 'MISMATCH';
    details: string;
    paymentAuthorized: boolean;
  }> {
    const result = await this.submitTransaction('ExecuteThreeWayMatch', tenantId, poId);
    return this.parseResult(result);
  }

  async getPurchaseOrderHistory(tenantId: string, poId: string): Promise<OnChainRecord[]> {
    const result = await this.evaluateTransaction('GetPurchaseOrderHistory', tenantId, poId);
    return this.parseResult<OnChainRecord[]>(result);
  }
}
