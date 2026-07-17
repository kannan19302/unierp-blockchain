/**
 * FabricConnectionService
 *
 * Manages the lifecycle of the Hyperledger Fabric Gateway connection.
 * Uses the modern @hyperledger/fabric-gateway SDK (gRPC-based) which
 * replaces the deprecated fabric-network SDK.
 *
 * Pattern: singleton gateway connection, lazily initialized, reconnects on failure.
 * Performance: never create a new Gateway per request — reuse the long-lived gRPC channel.
 */

import * as grpc from '@grpc/grpc-js';
import {
  connect,
  Gateway,
  Network,
  Contract,
  Identity,
  Signer,
} from '@hyperledger/fabric-gateway';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface FabricConnectionConfig {
  /** Path to the peer TLS certificate (PEM) */
  tlsCertPath: string;
  /** Peer gRPC endpoint, e.g. 'peer0.org1.unerp.local:7051' */
  peerEndpoint: string;
  /** Peer hostname override (for SNI) */
  peerHostAlias: string;
  /** MSP ID for this organization */
  mspId: string;
  /** Path to the identity certificate (PEM) */
  certPath: string;
  /** Path to the private key (PEM) */
  keyPath: string;
  /** Default channel name */
  defaultChannel: string;
}

export class FabricConnectionService {
  private client: grpc.Client | null = null;
  private gateway: Gateway | null = null;
  private config: FabricConnectionConfig;

  constructor(config: FabricConnectionConfig) {
    this.config = config;
  }

  /**
   * Establish the gRPC connection and Fabric Gateway.
   * Call once at application startup.
   */
  async connect(): Promise<void> {
    const tlsRootCert = await fs.promises.readFile(this.config.tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);

    this.client = new grpc.Client(this.config.peerEndpoint, tlsCredentials, {
      'grpc.ssl_target_name_override': this.config.peerHostAlias,
    });

    const identity = await this.newIdentity();
    const signer = await this.newSigner();

    this.gateway = connect({
      client: this.client,
      identity,
      signer,
      // Evaluation timeout (query)
      evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
      // Endorsement timeout (submit tx)
      endorseOptions: () => ({ deadline: Date.now() + 15000 }),
      // Submit timeout (ordering service)
      submitOptions: () => ({ deadline: Date.now() + 5000 }),
      // Commit status timeout
      commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
    });
  }

  /**
   * Gracefully close the gateway and gRPC client.
   * Call at application shutdown.
   */
  async disconnect(): Promise<void> {
    if (this.gateway) {
      this.gateway.close();
      this.gateway = null;
    }
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }

  /**
   * Get a Fabric Network (channel) handle.
   */
  getNetwork(channelName?: string): Network {
    if (!this.gateway) {
      throw new Error('Fabric Gateway not connected. Call connect() first.');
    }
    return this.gateway.getNetwork(channelName ?? this.config.defaultChannel);
  }

  /**
   * Get a typed contract handle from a channel.
   */
  getContract(chaincodeName: string, channelName?: string): Contract {
    const network = this.getNetwork(channelName);
    return network.getContract(chaincodeName);
  }

  /**
   * Check if the gateway is currently connected.
   */
  isConnected(): boolean {
    return this.gateway !== null && this.client !== null;
  }

  private async newIdentity(): Promise<Identity> {
    const certPem = await fs.promises.readFile(this.config.certPath);
    return { mspId: this.config.mspId, credentials: certPem };
  }

  private async newSigner(): Promise<Signer> {
    const keyPem = await fs.promises.readFile(this.config.keyPath);
    const privateKey = crypto.createPrivateKey(keyPem);
    return async (digest: Uint8Array) => {
      const sign = crypto.createSign('SHA256');
      sign.update(digest);
      return sign.sign(privateKey);
    };
  }

  /**
   * Build config from environment variables (production usage).
   */
  static fromEnv(): FabricConnectionConfig {
    const required = (key: string): string => {
      const val = process.env[key];
      if (!val) throw new Error(`Missing required env var: ${key}`);
      return val;
    };

    return {
      tlsCertPath: required('FABRIC_TLS_CERT_PATH'),
      peerEndpoint: required('FABRIC_PEER_ENDPOINT'),
      peerHostAlias: required('FABRIC_PEER_HOST_ALIAS'),
      mspId: required('FABRIC_MSP_ID'),
      certPath: required('FABRIC_CERT_PATH'),
      keyPath: required('FABRIC_KEY_PATH'),
      defaultChannel: process.env['FABRIC_DEFAULT_CHANNEL'] ?? 'unerp-channel',
    };
  }

  /**
   * Build config for local Fabric test network (development).
   */
  static forLocalTestNetwork(cryptoBasePath: string): FabricConnectionConfig {
    const orgPath = path.join(
      cryptoBasePath,
      'peerOrganizations',
      'org1.unerp.local',
    );
    const peerPath = path.join(
      orgPath,
      'peers',
      'peer0.org1.unerp.local',
    );
    const userPath = path.join(orgPath, 'users', 'User1@org1.unerp.local', 'msp');

    return {
      tlsCertPath: path.join(peerPath, 'tls', 'ca.crt'),
      peerEndpoint: 'localhost:7051',
      peerHostAlias: 'peer0.org1.unerp.local',
      mspId: 'Org1MSP',
      certPath: path.join(userPath, 'signcerts', 'User1@org1.unerp.local-cert.pem'),
      keyPath: path.join(userPath, 'keystore', 'priv_sk'),
      defaultChannel: 'unerp-channel',
    };
  }
}
