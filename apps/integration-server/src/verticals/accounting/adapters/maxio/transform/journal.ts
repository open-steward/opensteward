import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface MaxioJournalEntry {
  id: string | number
  memo: string
  transaction_date: string
  entries: Array<{
    id: string | number
    account_id: string
    description: string
    debit_amount_in_cents: number
    credit_amount_in_cents: number
    [key: string]: unknown
  }>
  [key: string]: unknown
}

function mapJournalLine(entry: MaxioJournalEntry['entries'][number]): JournalLineitem {
  return {
    id: String(entry.id),
    accountId: entry.account_id || undefined,
    description: entry.description || undefined,
    debitAmount: entry.debit_amount_in_cents ? entry.debit_amount_in_cents / 100 : undefined,
    creditAmount: entry.credit_amount_in_cents ? entry.credit_amount_in_cents / 100 : undefined,
  }
}

export function transformJournal(raw: MaxioJournalEntry): Journal {
  return {
    id: String(raw.id),
    description: raw.memo || undefined,
    lineItems: (raw.entries ?? []).map(mapJournalLine),
    postedAt: raw.transaction_date ? new Date(raw.transaction_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
