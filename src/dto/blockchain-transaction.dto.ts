/**
 * Blockchain DTOs
 *
 * Shared Data Transfer Objects for blockchain transaction tracking
 * and verification results. These types are shared between the
 * packages/blockchain layer and apps/api NestJS services.
 */

// ──────────────────────────────────────────────────────────────
// Enums (mirror Prisma enums to avoid cross-package dependency)
// ──────────────────────────────────────────────────────────────

export enum BlockchainTxStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
}

export enum VerificationResult {
  VERIFIED = 'VERIFIED',
  TAMPERED = 'TAMPERED',
  NOT_FOUND = 'NOT_FOUND',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

// ──────────────────────────────────────────────────────────────
// Entity types — what kinds of records can be anchored on-chain
// ──────────────────────────────────────────────────────────────

export enum BlockchainEntityType {
  /** Document hash registration */
  DOCUMENT = 'DOCUMENT',
  /** GL journal entry hash */
  GL_JOURNAL = 'GL_JOURNAL',
  /** Period-end close attestation */
  PERIOD_CLOSE = 'PERIOD_CLOSE',
  /** Inter-company netting proof */
  INTERCOMPANY_NETTING = 'INTERCOMPANY_NETTING',
  /** Shipment/ASN tracking event */
  SHIPMENT = 'SHIPMENT',
  /** Purchase order lifecycle */
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  /** Inventory batch event */
  INVENTORY_BATCH = 'INVENTORY_BATCH',
  /** Fixed asset lifecycle event */
  FIXED_ASSET = 'FIXED_ASSET',
  /** Marketplace plugin integrity */
  MARKETPLACE_PLUGIN = 'MARKETPLACE_PLUGIN',
}

// ──────────────────────────────────────────────────────────────
// Submission DTOs
// ──────────────────────────────────────────────────────────────

export interface SubmitToBlockchainDto {
  tenantId: string;
  entityType: BlockchainEntityType;
  entityId: string;
  /** JSON-serializable payload — will be SHA-256 hashed before submission */
  payload: Record<string, unknown>;
  chaincodeName: string;
  channelName: string;
  chaincodeFunction: string;
  /** Additional args to pass to the chaincode function besides the payload */
  additionalArgs?: string[];
}

export interface BlockchainSubmissionResult {
  /** Fabric transaction ID */
  transactionId: string;
  /** Block number the transaction was committed to */
  blockNumber: bigint;
  /** SHA-256 hash of the payload that was anchored */
  dataHash: string;
  /** ISO timestamp of the confirmed block */
  confirmedAt: string;
}

// ──────────────────────────────────────────────────────────────
// Verification DTOs
// ──────────────────────────────────────────────────────────────

export interface VerifyOnChainDto {
  tenantId: string;
  entityType: BlockchainEntityType;
  entityId: string;
  /** The current data from PostgreSQL to verify */
  currentPayload: Record<string, unknown>;
}

export interface BlockchainVerificationResponse {
  result: VerificationResult;
  entityType: BlockchainEntityType;
  entityId: string;
  /** Hash computed from current local data */
  localHash: string;
  /** Hash stored on-chain (null if NOT_FOUND or NETWORK_ERROR) */
  onChainHash: string | null;
  /** When the on-chain record was first committed (null if not found) */
  committedAt: string | null;
  /** Fabric block number (null if not found) */
  blockNumber: bigint | null;
  /** Fabric transaction ID (null if not found) */
  transactionId: string | null;
  /** Error message (only for NETWORK_ERROR) */
  error?: string;
}

// ──────────────────────────────────────────────────────────────
// On-chain record shapes (returned by chaincode query functions)
// ──────────────────────────────────────────────────────────────

export interface OnChainRecord {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  dataHash: string;
  metadata: Record<string, unknown>;
  committedAt: string;
  transactionId: string;
  blockNumber: string; // bigint serialized as string
  revoked?: boolean;
  revokedAt?: string;
  revokedReason?: string;
}

// ──────────────────────────────────────────────────────────────
// Hashing utility (consistent across all services)
// ──────────────────────────────────────────────────────────────

/**
 * Compute a deterministic SHA-256 hash of a JSON-serializable payload.
 * Keys are sorted to ensure consistency regardless of insertion order.
 */
export function computePayloadHash(payload: Record<string, unknown>): string {
  const { createHash } = require('crypto') as typeof import('crypto');
  const normalized = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}
