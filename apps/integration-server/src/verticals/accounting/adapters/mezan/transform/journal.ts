import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

// ── Mezan wire types ──────────────────────────────────────────────────────────

export interface MezanJournalEntry {
  id: string
  account_id?: string
  account_name?: string
  description?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export interface MezanJournal {
  id: string
  reference?: string
  transaction_date?: string   // YYYY-MM-DD
  description?: string
  transaction_note?: string
  status?: string             // 'draft' | 'confirmed'
  total_debits?: number
  total_credits?: number
  entries?: MezanJournalEntry[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Entry mapping ─────────────────────────────────────────────────────────────

function mapEntry(e: MezanJournalEntry): JournalLineitem {
  return {
    id: String(e.id),
    accountId: e.account_id ? String(e.account_id) : undefined,
    description: e.description || undefined,
    debitAmount: e.debit || undefined,
    creditAmount: e.credit || undefined,
  }
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformJournal(raw: MezanJournal): Journal {
  return {
    id: String(raw.id),
    reference: raw.reference || undefined,
    description: raw.description || raw.transaction_note || undefined,
    lineItems: (raw.entries ?? []).map(mapEntry),
    postedAt: raw.transaction_date ? new Date(raw.transaction_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Journal → Mezan request body (create). */
export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    transaction_date: toCalendarDate(journal.postedAt),
    description: journal.description,
    entries: journal.lineItems?.map((li) => ({
      account_id: li.accountId,
      description: li.description,
      debit: li.debitAmount,
      credit: li.creditAmount,
    })),
  }
}
