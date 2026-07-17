/**
 * DocumentRegistryContract — Hyperledger Fabric Chaincode
 *
 * Smart contract for registering, verifying, and revoking document
 * authenticity hashes on the UniERP blockchain ledger.
 *
 * Deployed on: unerp-channel
 * Chaincode name: document-registry
 *
 * Functions:
 *  - RegisterDocument   → store document hash + metadata
 *  - VerifyDocument     → query and return on-chain record
 *  - RevokeDocument     → mark document as revoked (immutable revocation)
 *  - GetTenantDocuments → list all documents for a tenant
 */

import { Context, Contract, Info, Returns, Transaction } from 'fabric-contract-api';
import { DocumentRecord, makeDocumentKey } from './models/documentRecord';

@Info({
  title: 'DocumentRegistryContract',
  description:
    'UniERP Document Authenticity Registry — stores SHA-256 hashes of documents on the immutable Fabric ledger.',
})
export class DocumentRegistryContract extends Contract {
  constructor() {
    super('DocumentRegistryContract');
  }

  /**
   * Initialize the chaincode ledger (called on first deploy).
   */
  @Transaction()
  async InitLedger(_ctx: Context): Promise<void> {
    // No seed data for document registry
  }

  /**
   * RegisterDocument — record a new document hash on the ledger.
   *
   * Args (JSON string):
   *   tenantId, documentId, documentHash, documentType, fileName,
   *   fileSize, mimeType, uploadedBy, uploadedAt
   *
   * Returns: DocumentRecord JSON
   */
  @Transaction()
  @Returns('string')
  async RegisterDocument(ctx: Context, argsJson: string): Promise<string> {
    const args = JSON.parse(argsJson) as {
      tenantId: string;
      documentId: string;
      documentHash: string;
      documentType: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      uploadedBy: string;
      uploadedAt: string;
    };

    // Validate required fields
    if (!args.tenantId || !args.documentId || !args.documentHash) {
      throw new Error('tenantId, documentId, and documentHash are required');
    }

    const key = makeDocumentKey(args.tenantId, args.documentId);

    // Check for idempotency — if same hash is already registered, return existing
    const existing = await ctx.stub.getState(key);
    if (existing && existing.length > 0) {
      const existingRecord: DocumentRecord = JSON.parse(existing.toString('utf8'));
      if (existingRecord.documentHash === args.documentHash) {
        return JSON.stringify(existingRecord);
      }
      throw new Error(
        `Document ${args.documentId} is already registered with a different hash. ` +
          `Use RevokeDocument first if the document needs to be replaced.`,
      );
    }

    const txId = ctx.stub.getTxID();
    const now = new Date().toISOString();

    const record: DocumentRecord = {
      docType: 'DocumentRecord',
      documentId: args.documentId,
      tenantId: args.tenantId,
      documentHash: args.documentHash,
      documentType: args.documentType,
      fileName: args.fileName,
      fileSize: args.fileSize,
      mimeType: args.mimeType,
      uploadedBy: args.uploadedBy,
      uploadedAt: args.uploadedAt,
      registrationTxId: txId,
      registrationBlock: '0', // Will be set by the block event listener
      revoked: false,
      createdAt: now,
    };

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)));

    // Emit chaincode event for the sync service
    await ctx.stub.setEvent(
      'DocumentRegistered',
      Buffer.from(
        JSON.stringify({
          tenantId: args.tenantId,
          documentId: args.documentId,
          documentHash: args.documentHash,
          txId,
        }),
      ),
    );

    return JSON.stringify(record);
  }

  /**
   * VerifyDocument — retrieve the on-chain record for a document.
   *
   * Returns: DocumentRecord JSON, or "null" if not found.
   */
  @Transaction(false)
  @Returns('string')
  async VerifyDocument(
    ctx: Context,
    tenantId: string,
    documentId: string,
  ): Promise<string> {
    const key = makeDocumentKey(tenantId, documentId);
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) {
      return 'null';
    }
    return data.toString('utf8');
  }

  /**
   * RevokeDocument — mark a document as revoked on the ledger.
   * Does NOT delete — adds revocation metadata (immutable trail).
   *
   * Args (JSON string):
   *   tenantId, documentId, revokedBy, reason
   */
  @Transaction()
  @Returns('string')
  async RevokeDocument(ctx: Context, argsJson: string): Promise<string> {
    const args = JSON.parse(argsJson) as {
      tenantId: string;
      documentId: string;
      revokedBy: string;
      reason: string;
    };

    const key = makeDocumentKey(args.tenantId, args.documentId);
    const data = await ctx.stub.getState(key);

    if (!data || data.length === 0) {
      throw new Error(`Document ${args.documentId} not found on ledger`);
    }

    const record: DocumentRecord = JSON.parse(data.toString('utf8'));

    if (record.revoked) {
      throw new Error(`Document ${args.documentId} is already revoked`);
    }

    record.revoked = true;
    record.revokedAt = new Date().toISOString();
    record.revokedBy = args.revokedBy;
    record.revokedReason = args.reason;

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)));

    await ctx.stub.setEvent(
      'DocumentRevoked',
      Buffer.from(
        JSON.stringify({
          tenantId: args.tenantId,
          documentId: args.documentId,
          revokedAt: record.revokedAt,
          revokedBy: args.revokedBy,
        }),
      ),
    );

    return JSON.stringify(record);
  }

  /**
   * GetTenantDocuments — retrieve all documents for a tenant.
   *
   * Returns: DocumentRecord[] JSON
   */
  @Transaction(false)
  @Returns('string')
  async GetTenantDocuments(ctx: Context, tenantId: string): Promise<string> {
    const prefix = `DOC~${tenantId}~`;
    const iterator = await ctx.stub.getStateByRange(prefix, prefix + '\xFF');

    const results: DocumentRecord[] = [];
    let result = await iterator.next();

    while (!result.done) {
      if (result.value && result.value.value) {
        try {
          const record: DocumentRecord = JSON.parse(
            result.value.value.toString('utf8'),
          );
          results.push(record);
        } catch {
          // Skip malformed records
        }
      }
      result = await iterator.next();
    }

    await iterator.close();
    return JSON.stringify(results);
  }
}
