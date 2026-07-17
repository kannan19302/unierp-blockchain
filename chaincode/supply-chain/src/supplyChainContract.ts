/**
 * SupplyChainTraceabilityContract — Hyperledger Fabric Chaincode
 *
 * Records end-to-end supply chain provenance, custody transfers,
 * checkpoint events, and recall notices on the immutable ledger.
 *
 * Multi-party network (Phase 3): Org1=UniERP, Org2=Supplier, Org3=Carrier
 * Single-party in Phase 0-2 — multi-org endorsement policies added in Phase 3.
 *
 * Deployed on: supplychain-channel
 * Chaincode name: supply-chain-traceability
 */

import { Context, Contract, Info, Returns, Transaction } from 'fabric-contract-api';

export interface ShipmentRecord {
  docType: 'ShipmentRecord';
  shipmentId: string;
  tenantId: string;
  asnId?: string;
  origin: { orgId: string; location: string; country: string };
  destination: { orgId: string; location: string; country: string };
  goods: Array<{ productId: string; batchId?: string; quantity: number; unit: string }>;
  currentCustodian: string;
  status: 'CREATED' | 'IN_TRANSIT' | 'DELIVERED' | 'RECALLED';
  expectedDelivery: string;
  checkpoints: CheckpointEvent[];
  custodyHistory: CustodyTransfer[];
  createdBy: string;
  createdAt: string;
  txId: string;
}

export interface CheckpointEvent {
  location: string;
  coordinates?: { lat: number; lng: number };
  status: string;
  temperature?: number;
  humidity?: number;
  recordedAt: string;
  recordedBy: string;
  txId: string;
}

export interface CustodyTransfer {
  fromOrg: string;
  toOrg: string;
  handoffAt: string;
  handoffLocation: string;
  signedBy: string;
  txId: string;
}

export interface RecallRecord {
  docType: 'RecallRecord';
  recallId: string;
  tenantId: string;
  batchId: string;
  productId: string;
  reason: string;
  severity: string;
  issuedBy: string;
  issuedAt: string;
  affectedShipments: string[];
  txId: string;
}

@Info({
  title: 'SupplyChainTraceabilityContract',
  description:
    'UniERP Supply Chain Traceability — end-to-end shipment provenance, custody transfers, and recall management.',
})
export class SupplyChainTraceabilityContract extends Contract {
  constructor() {
    super('SupplyChainTraceabilityContract');
  }

  @Transaction()
  async InitLedger(_ctx: Context): Promise<void> {}

  /**
   * RecordShipment — create a new shipment provenance record.
   */
  @Transaction()
  @Returns('string')
  async RecordShipment(ctx: Context, argsJson: string): Promise<string> {
    const args = JSON.parse(argsJson) as {
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

    const key = `SHIP~${args.tenantId}~${args.shipmentId}`;
    const existing = await ctx.stub.getState(key);
    if (existing && existing.length > 0) {
      return existing.toString('utf8'); // Idempotent
    }

    const txId = ctx.stub.getTxID();
    const now = new Date().toISOString();

    const record: ShipmentRecord = {
      docType: 'ShipmentRecord',
      shipmentId: args.shipmentId,
      tenantId: args.tenantId,
      asnId: args.asnId,
      origin: args.origin,
      destination: args.destination,
      goods: args.goods,
      currentCustodian: args.origin.orgId,
      status: 'CREATED',
      expectedDelivery: args.expectedDelivery,
      checkpoints: [],
      custodyHistory: [],
      createdBy: args.createdBy,
      createdAt: args.createdAt ?? now,
      txId,
    };

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)));
    await ctx.stub.setEvent('ShipmentRecorded', Buffer.from(JSON.stringify({
      tenantId: args.tenantId, shipmentId: args.shipmentId, txId,
    })));

    return JSON.stringify(record);
  }

  /**
   * TransferCustody — record a custody handoff between organizations.
   */
  @Transaction()
  @Returns('string')
  async TransferCustody(ctx: Context, argsJson: string): Promise<string> {
    const args = JSON.parse(argsJson) as {
      tenantId: string;
      shipmentId: string;
      fromOrg: string;
      toOrg: string;
      handoffAt: string;
      handoffLocation: string;
      signedBy: string;
    };

    const key = `SHIP~${args.tenantId}~${args.shipmentId}`;
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) {
      throw new Error(`Shipment ${args.shipmentId} not found on ledger`);
    }

    const record: ShipmentRecord = JSON.parse(data.toString('utf8'));
    const txId = ctx.stub.getTxID();

    const transfer: CustodyTransfer = {
      fromOrg: args.fromOrg,
      toOrg: args.toOrg,
      handoffAt: args.handoffAt,
      handoffLocation: args.handoffLocation,
      signedBy: args.signedBy,
      txId,
    };

    record.custodyHistory.push(transfer);
    record.currentCustodian = args.toOrg;
    record.status = 'IN_TRANSIT';

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)));
    await ctx.stub.setEvent('CustodyTransferred', Buffer.from(JSON.stringify({
      tenantId: args.tenantId, shipmentId: args.shipmentId, fromOrg: args.fromOrg, toOrg: args.toOrg, txId,
    })));

    return JSON.stringify(record);
  }

  /**
   * RecordCheckpoint — add a transit checkpoint event (location, temp, etc).
   */
  @Transaction()
  @Returns('string')
  async RecordCheckpoint(ctx: Context, argsJson: string): Promise<string> {
    const args = JSON.parse(argsJson) as {
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

    const key = `SHIP~${args.tenantId}~${args.shipmentId}`;
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) {
      throw new Error(`Shipment ${args.shipmentId} not found on ledger`);
    }

    const record: ShipmentRecord = JSON.parse(data.toString('utf8'));
    const txId = ctx.stub.getTxID();

    const checkpoint: CheckpointEvent = {
      location: args.location,
      coordinates: args.coordinates,
      status: args.status,
      temperature: args.temperature,
      humidity: args.humidity,
      recordedAt: args.recordedAt,
      recordedBy: args.recordedBy,
      txId,
    };

    record.checkpoints.push(checkpoint);

    if (args.status === 'DELIVERED') {
      record.status = 'DELIVERED';
    }

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)));

    return JSON.stringify(record);
  }

  /**
   * VerifyProvenance — retrieve the full provenance chain for a product/batch.
   */
  @Transaction(false)
  @Returns('string')
  async VerifyProvenance(
    ctx: Context,
    tenantId: string,
    productId: string,
    batchId: string,
  ): Promise<string> {
    // Query all shipments for this tenant
    const prefix = `SHIP~${tenantId}~`;
    const iterator = await ctx.stub.getStateByRange(prefix, prefix + '\xFF');

    const matchingShipments: ShipmentRecord[] = [];
    let result = await iterator.next();

    while (!result.done) {
      if (result.value?.value) {
        const record: ShipmentRecord = JSON.parse(result.value.value.toString('utf8'));
        const hasGoods = record.goods.some(
          (g) => g.productId === productId && (!batchId || g.batchId === batchId),
        );
        if (hasGoods) {
          matchingShipments.push(record);
        }
      }
      result = await iterator.next();
    }

    await iterator.close();
    return JSON.stringify(matchingShipments);
  }

  /**
   * IssueRecall — issue a product recall notice propagated across the chain.
   */
  @Transaction()
  @Returns('string')
  async IssueRecall(ctx: Context, argsJson: string): Promise<string> {
    const args = JSON.parse(argsJson) as {
      tenantId: string;
      batchId: string;
      productId: string;
      reason: string;
      severity: string;
      issuedBy: string;
      issuedAt: string;
    };

    const recallId = `RECALL-${args.batchId}-${Date.now()}`;
    const key = `RECALL~${args.tenantId}~${recallId}`;
    const txId = ctx.stub.getTxID();

    // Find all shipments that contain this batch and mark them
    const prefix = `SHIP~${args.tenantId}~`;
    const iterator = await ctx.stub.getStateByRange(prefix, prefix + '\xFF');
    const affectedShipments: string[] = [];

    let result = await iterator.next();
    while (!result.done) {
      if (result.value?.value) {
        const shipment: ShipmentRecord = JSON.parse(result.value.value.toString('utf8'));
        const affected = shipment.goods.some(
          (g) => g.batchId === args.batchId && g.productId === args.productId,
        );
        if (affected && shipment.status !== 'DELIVERED') {
          shipment.status = 'RECALLED';
          const shipKey = `SHIP~${args.tenantId}~${shipment.shipmentId}`;
          await ctx.stub.putState(shipKey, Buffer.from(JSON.stringify(shipment)));
          affectedShipments.push(shipment.shipmentId);
        }
      }
      result = await iterator.next();
    }
    await iterator.close();

    const recall: RecallRecord = {
      docType: 'RecallRecord',
      recallId,
      tenantId: args.tenantId,
      batchId: args.batchId,
      productId: args.productId,
      reason: args.reason,
      severity: args.severity,
      issuedBy: args.issuedBy,
      issuedAt: args.issuedAt,
      affectedShipments,
      txId,
    };

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(recall)));
    await ctx.stub.setEvent('RecallIssued', Buffer.from(JSON.stringify({
      tenantId: args.tenantId, recallId, batchId: args.batchId, affectedShipments, txId,
    })));

    return JSON.stringify(recall);
  }

  /**
   * GetShipmentHistory — retrieve a specific shipment's full on-chain record.
   */
  @Transaction(false)
  @Returns('string')
  async GetShipmentHistory(
    ctx: Context,
    tenantId: string,
    shipmentId: string,
  ): Promise<string> {
    const key = `SHIP~${tenantId}~${shipmentId}`;
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) return '[]';
    return `[${data.toString('utf8')}]`;
  }
}

export const contracts = [SupplyChainTraceabilityContract];
