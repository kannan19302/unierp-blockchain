/**
 * Fabric Channel Configuration
 *
 * Defines all channels used by UniERP's blockchain integration.
 * Each channel groups related chaincodes and can have different
 * access policies (which orgs participate).
 */

export const FABRIC_CHANNELS = {
  /**
   * Primary UniERP operational channel.
   * Contains: document-registry, finance-ledger chaincodes.
   * Participants: UniERP tenant org only (single-org for Phase 0-2).
   */
  UNERP_MAIN: 'unerp-channel',

  /**
   * Supply chain traceability channel.
   * Contains: supply-chain chaincode.
   * Participants: UniERP + Supplier orgs + Carrier orgs (multi-org, Phase 3).
   */
  SUPPLY_CHAIN: 'supplychain-channel',

  /**
   * Procurement smart contract channel.
   * Contains: procurement chaincode.
   * Participants: UniERP + Vendor orgs (multi-org, Phase 4).
   */
  PROCUREMENT: 'procurement-channel',
} as const;

export type FabricChannel = (typeof FABRIC_CHANNELS)[keyof typeof FABRIC_CHANNELS];

/**
 * Chaincode names deployed on each channel.
 * Keep in sync with network/scripts/deploy-chaincode.sh.
 */
export const FABRIC_CHAINCODES = {
  DOCUMENT_REGISTRY: 'document-registry',
  FINANCE_LEDGER: 'finance-ledger',
  SUPPLY_CHAIN: 'supply-chain-traceability',
  PROCUREMENT: 'procurement-lifecycle',
} as const;

export type FabricChaincode = (typeof FABRIC_CHAINCODES)[keyof typeof FABRIC_CHAINCODES];

/**
 * Maps each chaincode to its default channel.
 */
export const CHAINCODE_CHANNEL_MAP: Record<FabricChaincode, FabricChannel> = {
  [FABRIC_CHAINCODES.DOCUMENT_REGISTRY]: FABRIC_CHANNELS.UNERP_MAIN,
  [FABRIC_CHAINCODES.FINANCE_LEDGER]: FABRIC_CHANNELS.UNERP_MAIN,
  [FABRIC_CHAINCODES.SUPPLY_CHAIN]: FABRIC_CHANNELS.SUPPLY_CHAIN,
  [FABRIC_CHAINCODES.PROCUREMENT]: FABRIC_CHANNELS.PROCUREMENT,
};
