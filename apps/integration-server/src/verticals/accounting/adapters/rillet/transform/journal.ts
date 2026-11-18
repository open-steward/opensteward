import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'
import { rilletAmountToMinor, type RilletMonetaryAmount } from '../money'

// ── Rillet API types ───────────────────────────────────────────────────────────

export type { RilletMonetaryAmount }

export interface RilletJournalEntryItem {
  id: string
  description?: string
  amount: RilletMonetaryAmount
  account_id: string
  account_code: string
  side: 'DEBIT' | 'CREDIT'
  [key: string]: unknown
}

export interface RilletJournalEntry {
  id: string
  name: string
  currency: string
  date: string
  subsidiary_id?: string
  items: RilletJournalEntryItem[]
  reversal_date?: string
  updated_at: string
  [key: string]: unknown
}

// ── Line items ─────────────────────────────────────────────────────────────────

function mapLineItems(items: RilletJournalEntryItem[]): JournalLineitem[] {
  return (items ?? []).map((item) => ({
    id: item.id || undefined,
    accountId: item.account_id || undefined,
    description: item.description || undefined,
    debitAmount: item.side === 'DEBIT' ? rilletAmountToMinor(item.amount) : undefined,
    creditAmount: item.side === 'CREDIT' ? rilletAmountToMinor(item.amount) : undefined,
    totalAmount: rilletAmountToMinor(item.amount),
  }))
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformJournal(raw: RilletJournalEntry): Journal {
  return {
    id: raw.id,
    description: raw.name || undefined,
    currency: raw.currency || undefined,
    lineItems: mapLineItems(raw.items ?? []),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
