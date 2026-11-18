import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'
import { toMinorUnits, toCalendarDate } from '../../shared/transform'

export interface CampfireJournalTransaction {
  id?: number | null
  account?: number | null
  account_name?: string | null
  account_number?: string | null
  amount?: number | null
  debit_amount?: number | null
  credit_amount?: number | null
  currency?: string | null
  vendor?: number | null
  vendor_name?: string | null
  department?: number | null
  note?: string | null
  transaction_id?: string | null
  [key: string]: unknown
}

export interface CampfireJournalEntry {
  id: number
  journal_id?: string | null
  date?: string | null
  memo?: string | null
  currency?: string | null
  source?: string | null
  ref_number?: string | null
  entity?: number | null
  entity_name?: string | null
  created_at?: string | null
  last_modified_at?: string | null
  transactions?: CampfireJournalTransaction[]
  [key: string]: unknown
}

function mapTransaction(tx: CampfireJournalTransaction): JournalLineitem {
  return {
    id: tx.transaction_id || (tx.id != null ? String(tx.id) : undefined),
    accountId: tx.account != null ? String(tx.account) : undefined,
    contactId: tx.vendor != null ? String(tx.vendor) : undefined,
    description: tx.note || undefined,
    // Campfire amounts are decimal dollars; canonical is integer minor units
    debitAmount: toMinorUnits(tx.debit_amount),
    creditAmount: toMinorUnits(tx.credit_amount),
    totalAmount: toMinorUnits(tx.amount),
  }
}

export function transformJournal(raw: CampfireJournalEntry): Journal {
  return {
    id: raw.journal_id ?? String(raw.id),
    description: raw.memo || undefined,
    reference: raw.ref_number || undefined,
    source: raw.source || undefined,
    currency: raw.currency || undefined,
    lineItems: (raw.transactions ?? []).map(mapTransaction),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.last_modified_at ? new Date(raw.last_modified_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// Canonical Journal → Campfire journal entry body (for create)
// Canonical amounts are integer minor units; Campfire expects decimal dollars → divide by 100.
export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    date: toCalendarDate(journal.postedAt),
    memo: journal.description,
    currency: journal.currency,
    transactions: journal.lineItems?.map((li) => ({
      account: li.accountId ? Number(li.accountId) : undefined,
      debit_amount: li.debitAmount != null ? li.debitAmount / 100 : undefined,
      credit_amount: li.creditAmount != null ? li.creditAmount / 100 : undefined,
      note: li.description,
      vendor: li.contactId ? Number(li.contactId) : undefined,
    })),
  }
}
