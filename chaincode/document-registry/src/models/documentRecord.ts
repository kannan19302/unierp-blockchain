/**
 * DocumentRecord — On-chain data model for the Document Registry chaincode.
 *
 * Every registered document is stored as a DocumentRecord on the Fabric ledger.
 * The ledger key is: `DOC~{tenantId}~{documentId}`
 */
export interface DocumentRecord {
  /** Composite key prefix */
  docType: 'DocumentRecord';
  /** Unique document identifier (from PostgreSQL) */
  documentId: string;
  /** UniERP tenant that owns this document */
  tenantId: string;
  /** SHA-256 hash of the document binary */
  documentHash: string;
  /** Document classification */
  documentType: string;
  /** Original file name */
  fileName: string;
  /** File size in bytes */
  fileSize: number;
  /** MIME type */
  mimeType: string;
  /** User who uploaded the document */
  uploadedBy: string;
  /** ISO 8601 timestamp */
  uploadedAt: string;
  /** Fabric transaction ID when registered */
  registrationTxId: string;
  /** Fabric block number when committed */
  registrationBlock: string;
  /** Whether the document has been revoked */
  revoked: boolean;
  /** ISO 8601 timestamp of revocation (if revoked) */
  revokedAt?: string;
  /** User who revoked the document */
  revokedBy?: string;
  /** Reason for revocation */
  revokedReason?: string;
  /** ISO 8601 creation timestamp on ledger */
  createdAt: string;
}

export function makeDocumentKey(tenantId: string, documentId: string): string {
  return `DOC~${tenantId}~${documentId}`;
}
