import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

// ── Puzzle wire types ─────────────────────────────────────────────────────────

export interface PuzzleLedgerEntry {
  accountId?: string
  amount?: string
  currency?: string
  description?: string
  [key: string]: unknown
}

export interface PuzzleLedgerJournal {
  id: string
  createdAt?: string
  effectiveAt?: string
  postedAt?: string
  description?: string
  sequenceId?: string
  entries?: PuzzleLedgerEntry[]
  [key: string]: unknown
}

// ── Line mapping ──────────────────────────────────────────────────────────────

function mapEntry(entry: PuzzleLedgerEntry): JournalLineitem {
  const amountCents =
    entry.amount != null ? Math.round(parseFloat(entry.amount) * 100) : undefined
  // Puzzle ledger entries use signed amounts: positive = debit, negative = credit
  const isDebit = amountCents != null && amountCents >= 0
  return {
    accountId: entry.accountId || undefined,
    description: entry.description || undefined,
    debitAmount: isDebit ? (amountCents ?? undefined) : undefined,
    creditAmount: !isDebit && amountCents != null ? Math.abs(amountCents) : undefined,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformJournal(raw: PuzzleLedgerJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    reference: raw.sequenceId || undefined,
    lineItems: (raw.entries ?? []).map(mapEntry),
    postedAt: raw.postedAt
      ? new Date(raw.postedAt)
      : raw.effectiveAt
        ? new Date(raw.effectiveAt)
        : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
