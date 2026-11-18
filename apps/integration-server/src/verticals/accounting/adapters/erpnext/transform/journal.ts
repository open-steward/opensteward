import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ErpNextJournalAccount {
  name: string
  account: string
  user_remark: string
  debit_in_account_currency: number
  credit_in_account_currency: number
  [key: string]: unknown
}

export interface ErpNextJournalEntry {
  name: string
  posting_date: string
  user_remark: string
  accounts: ErpNextJournalAccount[]
  [key: string]: unknown
}

function mapLineitem(row: ErpNextJournalAccount): JournalLineitem {
  return {
    id: row.name || undefined,
    accountId: row.account || undefined,
    description: row.user_remark || undefined,
    debitAmount: row.debit_in_account_currency || undefined,
    creditAmount: row.credit_in_account_currency || undefined,
  }
}

export function transformJournal(raw: ErpNextJournalEntry): Journal {
  return {
    id: raw.name,
    reference: raw.name,
    description: raw.user_remark || undefined,
    lineItems: (raw.accounts ?? []).map(mapLineitem),
    postedAt: raw.posting_date ? new Date(raw.posting_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
