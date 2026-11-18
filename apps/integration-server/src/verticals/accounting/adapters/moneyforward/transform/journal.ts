import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface MoneyForwardJournalEntryDetail {
  id: string
  account_item_id: string | null
  account_item_name: string | null
  debit_amount: number
  credit_amount: number
  description: string | null
  [key: string]: unknown
}

export interface MoneyForwardJournalEntry {
  id: string
  journal_entry_date: string
  description: string | null
  memo: string | null
  journal_entry_details: MoneyForwardJournalEntryDetail[]
  [key: string]: unknown
}

function mapDetail(detail: MoneyForwardJournalEntryDetail): JournalLineitem {
  return {
    accountId: detail.account_item_id ? String(detail.account_item_id) : undefined,
    description: detail.description || undefined,
    debitAmount: detail.debit_amount || undefined,
    creditAmount: detail.credit_amount || undefined,
  }
}

export function transformJournal(raw: MoneyForwardJournalEntry): Journal {
  return {
    id: String(raw.id),
    description: raw.description || raw.memo || undefined,
    lineItems: (raw.journal_entry_details ?? []).map(mapDetail),
    postedAt: raw.journal_entry_date ? new Date(raw.journal_entry_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
