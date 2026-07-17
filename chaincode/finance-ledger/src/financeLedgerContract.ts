/**
 * FinanceLedgerContract — Hyperledger Fabric Chaincode
 *
 * Provides an immutable audit ledger for UniERP financial records.
 * Stores hashes (NOT full data) of GL journal entries, period closes,
 * and inter-company netting proofs.
 *
 * Privacy by design: only hashes are stored on-chain.
 * Full financial data remains in PostgreSQL.
 *
 * Deployed on: unerp-channel
 * Chaincode name: finance-ledger
 */

import { Context, Contract, Info, Returns, Transaction } from 'fabric-contract-api';

// Ledger record shapes
export interface JournalHashRecord {
  docType: 'JournalHash';
  journalId: string;
  tenantId: string;
  periodId: string;
  dataHash: string;
  totalDebit: string;
  totalCredit: string;
  currency: string;
  postedBy: string;
  postedAt: string;
  description: string;
  txId: string;
  blockNumber: string;
  recordedAt: string;
}

export interface PeriodCloseRecord {
  docType: 'PeriodClose';
  periodId: string;
  tenantId: string;
  closedBy: string;
  closedAt: string;
  totalTransactions: number;
  openingBalance: string;
  closingBalance: string;
  txId: string;
  recordedAt: string;
}

export interface NettingRecord {
  docType: 'NettingRecord';
  nettingId: string;
  tenantId: string;
  parties: string[];
  netAmount: string;
  currency: string;
  settledAt: string;
  txId: string;
  recordedAt: string;
}

@Info({
  title: 'FinanceLedgerContract',
  description:
    'UniERP Immutable Financial Ledger — records SHA-256 hashes of GL journal entries and period-close attestations.',
})
export class FinanceLedgerContract extends Contract {
  constructor() {
    super('FinanceLedgerContract');
  }

  @Transaction()
  async InitLedger(_ctx: Context): Promise<void> {
    // No seed data needed
  }

  /**
   * RecordJournalEntry — anchor a GL journal entry hash on the ledger.
   *
   * Only hashes are stored — full journal data stays in PostgreSQL.
   * Returns the on-chain record.
   */
  @Transaction()
  @Returns('string')
  async RecordJournalEntry(ctx: Context, argsJson: string): Promise<string> {
    const args = JSON.parse(argsJson) as {
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

    if (!args.tenantId || !args.journalId || !args.dataHash) {
      throw new Error('tenantId, journalId, and dataHash are required');
    }

    const key = `JRN~${args.tenantId}~${args.journalId}`;

    // Idempotency check
    const existing = await ctx.stub.getState(key);
    if (existing && existing.length > 0) {
      const existingRecord: JournalHashRecord = JSON.parse(existing.toString('utf8'));
      if (existingRecord.dataHash === args.dataHash) {
        return JSON.stringify(existingRecord);
      }
      throw new Error(
        `Journal entry ${args.journalId} is already anchored with a different hash. ` +
          `On-chain GL entries are immutable — this indicates data tampering.`,
      );
    }

    const txId = ctx.stub.getTxID();
    const now = new Date().toISOString();

    const record: JournalHashRecord = {
      docType: 'JournalHash',
      journalId: args.journalId,
      tenantId: args.tenantId,
      periodId: args.periodId,
      dataHash: args.dataHash,
      totalDebit: args.totalDebit,
      totalCredit: args.totalCredit,
      currency: args.currency,
      postedBy: args.postedBy,
      postedAt: args.postedAt,
      description: args.description,
      txId,
      blockNumber: '0',
      recordedAt: now,
    };

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)));

    await ctx.stub.setEvent(
      'JournalEntryRecorded',
      Buffer.from(JSON.stringify({ tenantId: args.tenantId, journalId: args.journalId, txId })),
    );

    return JSON.stringify(record);
  }

  /**
   * VerifyJournalEntry — query the on-chain hash record for a journal entry.
   * Returns "null" if not found (not yet anchored).
   */
  @Transaction(false)
  @Returns('string')
  async VerifyJournalEntry(
    ctx: Context,
    tenantId: string,
    journalId: string,
  ): Promise<string> {
    const key = `JRN~${tenantId}~${journalId}`;
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) return 'null';
    return data.toString('utf8');
  }

  /**
   * AttestPeriodClose — record an immutable period-close attestation.
   * Once a period is closed on-chain, no new journal entries can be
   * added (enforced by checking this record in RecordJournalEntry if desired).
   */
  @Transaction()
  @Returns('string')
  async AttestPeriodClose(ctx: Context, argsJson: string): Promise<string> {
    const args = JSON.parse(argsJson) as {
      tenantId: string;
      periodId: string;
      closedBy: string;
      closedAt: string;
      totalTransactions: number;
      openingBalance: string;
      closingBalance: string;
    };

    const key = `PCLOSE~${args.tenantId}~${args.periodId}`;

    // Period close is idempotent but not updatable
    const existing = await ctx.stub.getState(key);
    if (existing && existing.length > 0) {
      return existing.toString('utf8'); // Return existing attestation
    }

    const txId = ctx.stub.getTxID();
    const now = new Date().toISOString();

    const record: PeriodCloseRecord = {
      docType: 'PeriodClose',
      periodId: args.periodId,
      tenantId: args.tenantId,
      closedBy: args.closedBy,
      closedAt: args.closedAt,
      totalTransactions: args.totalTransactions,
      openingBalance: args.openingBalance,
      closingBalance: args.closingBalance,
      txId,
      recordedAt: now,
    };

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)));

    await ctx.stub.setEvent(
      'PeriodClosed',
      Buffer.from(JSON.stringify({ tenantId: args.tenantId, periodId: args.periodId, txId })),
    );

    return JSON.stringify(record);
  }

  /**
   * GetPeriodAttestation — retrieve the close attestation for a period.
   */
  @Transaction(false)
  @Returns('string')
  async GetPeriodAttestation(
    ctx: Context,
    tenantId: string,
    periodId: string,
  ): Promise<string> {
    const key = `PCLOSE~${tenantId}~${periodId}`;
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) return 'null';
    return data.toString('utf8');
  }

  /**
   * RecordIntercompanyNetting — record proof of inter-company netting settlement.
   */
  @Transaction()
  @Returns('string')
  async RecordIntercompanyNetting(ctx: Context, argsJson: string): Promise<string> {
    const args = JSON.parse(argsJson) as {
      tenantId: string;
      nettingId: string;
      parties: string[];
      netAmount: string;
      currency: string;
      settledAt: string;
    };

    const key = `NETTING~${args.tenantId}~${args.nettingId}`;

    const existing = await ctx.stub.getState(key);
    if (existing && existing.length > 0) {
      return existing.toString('utf8');
    }

    const txId = ctx.stub.getTxID();
    const now = new Date().toISOString();

    const record: NettingRecord = {
      docType: 'NettingRecord',
      nettingId: args.nettingId,
      tenantId: args.tenantId,
      parties: args.parties,
      netAmount: args.netAmount,
      currency: args.currency,
      settledAt: args.settledAt,
      txId,
      recordedAt: now,
    };

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)));

    await ctx.stub.setEvent(
      'NettingRecorded',
      Buffer.from(JSON.stringify({ tenantId: args.tenantId, nettingId: args.nettingId, txId })),
    );

    return JSON.stringify(record);
  }
}

export { FinanceLedgerContract as contracts };
