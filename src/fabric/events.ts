/**
 * BlockchainEventListener
 *
 * Listens for chaincode events emitted by the Fabric ledger and
 * dispatches them to registered handlers (for PostgreSQL projection).
 *
 * This implements the "Event-Driven Listener" pattern from the hybrid
 * architecture — the primary mechanism by which on-chain state is
 * mirrored back into PostgreSQL for fast querying.
 */

import {
  Network,
  CloseableAsyncIterable,
  ChaincodeEvent,
} from "@hyperledger/fabric-gateway";

export type ChaincodeEventHandler = (
  eventName: string,
  payload: unknown,
  txId: string,
  blockNumber: bigint,
) => Promise<void>;

export interface EventListenerConfig {
  channelName: string;
  chaincodeName: string;
  startBlock?: bigint;
}

/**
 * How a listener failure is reported.
 *
 * Swallowing it is not an option — a chaincode event stream that dies silently
 * takes the ledger out of sync with the database and nothing notices. Writing
 * to the console is not an option either: this package is consumed by services
 * with structured, tenant-labelled logging, and console output bypasses all of
 * it (§ 11 requires every log line carry a tenant label).
 *
 * So the caller supplies the sink. The default rethrows on the next tick, which
 * surfaces as an unhandled rejection the process-level handler will log
 * properly, rather than vanishing.
 */
export type EventListenerErrorHandler = (
  listenerKey: string,
  error: unknown,
) => void;

const rethrowAsync: EventListenerErrorHandler = (listenerKey, error) => {
  queueMicrotask(() => {
    throw error instanceof Error
      ? new Error(`Event listener error for ${listenerKey}: ${error.message}`, {
          cause: error,
        })
      : new Error(`Event listener error for ${listenerKey}: ${String(error)}`);
  });
};

export class BlockchainEventListener {
  private handlers = new Map<string, ChaincodeEventHandler[]>();
  private activeListeners = new Map<
    string,
    CloseableAsyncIterable<ChaincodeEvent>
  >();
  private readonly onError: EventListenerErrorHandler;

  constructor(options: { onError?: EventListenerErrorHandler } = {}) {
    this.onError = options.onError ?? rethrowAsync;
  }

  /**
   * Register a handler for a specific chaincode event name.
   * Multiple handlers can be registered for the same event.
   */
  on(eventName: string, handler: ChaincodeEventHandler): this {
    const existing = this.handlers.get(eventName) ?? [];
    this.handlers.set(eventName, [...existing, handler]);
    return this;
  }

  /**
   * Start listening for events from a chaincode on a given network.
   * Runs indefinitely until stop() is called.
   */
  async startListening(
    network: Network,
    config: EventListenerConfig,
  ): Promise<void> {
    const listenerKey = `${config.channelName}:${config.chaincodeName}`;

    if (this.activeListeners.has(listenerKey)) {
      return; // Already listening
    }

    const events = await network.getChaincodeEvents(config.chaincodeName, {
      startBlock: config.startBlock,
    });

    this.activeListeners.set(listenerKey, events);

    // Process events asynchronously (non-blocking)
    this.processEvents(events).catch((err) => {
      this.onError(listenerKey, err);
    });
  }

  /**
   * Stop listening on a specific chaincode.
   */
  stopListening(channelName: string, chaincodeName: string): void {
    const listenerKey = `${channelName}:${chaincodeName}`;
    const events = this.activeListeners.get(listenerKey);
    if (events) {
      events.close();
      this.activeListeners.delete(listenerKey);
    }
  }

  /**
   * Stop all active listeners.
   */
  stopAll(): void {
    for (const [key, events] of this.activeListeners.entries()) {
      events.close();
      this.activeListeners.delete(key);
    }
  }

  private async processEvents(
    events: CloseableAsyncIterable<ChaincodeEvent>,
  ): Promise<void> {
    try {
      for await (const event of events) {
        await this.dispatch(event);
      }
    } catch (err: unknown) {
      // Only re-throw if not closed deliberately
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("CANCELLED") && !message.includes("closed")) {
        throw err;
      }
    }
  }

  private async dispatch(event: ChaincodeEvent): Promise<void> {
    const eventName = event.eventName;
    const handlers =
      this.handlers.get(eventName) ?? this.handlers.get("*") ?? [];

    if (handlers.length === 0) return;

    let payload: unknown = null;
    if (event.payload && event.payload.length > 0) {
      try {
        payload = JSON.parse(Buffer.from(event.payload).toString("utf8"));
      } catch {
        payload = Buffer.from(event.payload).toString("utf8");
      }
    }

    await Promise.all(
      handlers.map((handler) =>
        handler(eventName, payload, event.transactionId, event.blockNumber),
      ),
    );
  }
}
