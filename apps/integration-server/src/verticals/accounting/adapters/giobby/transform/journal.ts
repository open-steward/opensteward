import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface GiobbyJournalLine {
  account_code: string
  description: string
  debit_amount: number
  credit_amount: number
  [key: string]: unknown
}

export interface GiobbyJournal {
  id: string
  reference: string
  description: string
  date: string
  lines?: GiobbyJournalLine[]
  [key: string]: unknown
}

function mapLineitem(row: GiobbyJournalLine): JournalLineitem {
  return {
    accountId: row.account_code || undefined,
    description: row.description || undefined,
    debitAmount: row.debit_amount || undefined,
    creditAmount: row.credit_amount || undefined,
  }
}

export function transformJournal(raw: GiobbyJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
