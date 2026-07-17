/**
 * @unerp/blockchain — Public API
 *
 * Export everything needed by apps/api NestJS modules
 * to interact with the Hyperledger Fabric blockchain layer.
 */

// Fabric connection infrastructure
export { FabricConnectionService } from './fabric/connection';
export type { FabricConnectionConfig } from './fabric/connection';

export { BlockchainEventListener } from './fabric/events';
export type { ChaincodeEventHandler, EventListenerConfig } from './fabric/events';

export { FABRIC_CHANNELS, FABRIC_CHAINCODES, CHAINCODE_CHANNEL_MAP } from './fabric/channels';
export type { FabricChannel, FabricChaincode } from './fabric/channels';

// DTOs and enums
export {
  BlockchainTxStatus,
  VerificationResult,
  BlockchainEntityType,
  computePayloadHash,
} from './dto/blockchain-transaction.dto';

export type {
  SubmitToBlockchainDto,
  BlockchainSubmissionResult,
  VerifyOnChainDto,
  BlockchainVerificationResponse,
  OnChainRecord,
} from './dto/blockchain-transaction.dto';

// Typed contract wrappers
export {
  TypedContract,
  DocumentRegistryContract,
  FinanceLedgerContract,
  SupplyChainTraceabilityContract,
  ProcurementLifecycleContract,
} from './contracts/index';

export type {
  DocumentRegistryArgs,
  FinanceLedgerArgs,
  SupplyChainArgs,
  ProcurementArgs,
} from './contracts/index';
