/**
 * @unerp/blockchain — Public API
 *
 * Export everything needed by apps/api NestJS modules
 * to interact with the Hyperledger Fabric blockchain layer.
 */

// Fabric connection infrastructure
export { FabricConnectionService } from './fabric/connection.js';
export type { FabricConnectionConfig } from './fabric/connection.js';

export { BlockchainEventListener } from './fabric/events.js';
export type { ChaincodeEventHandler, EventListenerConfig } from './fabric/events.js';

export { FABRIC_CHANNELS, FABRIC_CHAINCODES, CHAINCODE_CHANNEL_MAP } from './fabric/channels.js';
export type { FabricChannel, FabricChaincode } from './fabric/channels.js';

// DTOs and enums
export {
  BlockchainTxStatus,
  VerificationResult,
  BlockchainEntityType,
  computePayloadHash,
} from './dto/blockchain-transaction.dto.js';

export type {
  SubmitToBlockchainDto,
  BlockchainSubmissionResult,
  VerifyOnChainDto,
  BlockchainVerificationResponse,
  OnChainRecord,
} from './dto/blockchain-transaction.dto.js';

// Typed contract wrappers
export {
  TypedContract,
  DocumentRegistryContract,
  FinanceLedgerContract,
  SupplyChainTraceabilityContract,
  ProcurementLifecycleContract,
} from './contracts/index.js';

export type {
  DocumentRegistryArgs,
  FinanceLedgerArgs,
  SupplyChainArgs,
  ProcurementArgs,
} from './contracts/index.js';
