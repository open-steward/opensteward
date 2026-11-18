import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface MisaAmisJournalDetail {
  id: string
  account_id: string
  account_code: string
  account_name: string
  description: string
  debit_amount: number
  credit_amount: number
  currency_code: string
  [key: string]: unknown
}

export interface MisaAmisJournalEntry {
  id: string
  reference_number: string
  entry_date: string
  description: string
  journal_entry_details: MisaAmisJournalDetail[]
  [key: string]: unknown
}

function mapJournalLineitem(row: MisaAmisJournalDetail): JournalLineitem {
  return {
    accountId: row.account_id || undefined,
    description: row.description || undefined,
    debitAmount: row.debit_amount || undefined,
    creditAmount: row.credit_amount || undefined,
  }
}

export function transformJournal(raw: MisaAmisJournalEntry): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    reference: raw.reference_number || undefined,
    lineItems: (raw.journal_entry_details ?? []).map(mapJournalLineitem),
    postedAt: raw.entry_date ? new Date(raw.entry_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
