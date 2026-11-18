import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface SistemiJournalLine {
  account_code: string
  description: string
  debit_amount: number
  credit_amount: number
  [key: string]: unknown
}

export interface SistemiJournal {
  id: string
  reference: string
  description: string
  date: string
  lines?: SistemiJournalLine[]
  [key: string]: unknown
}

function mapLineitem(row: SistemiJournalLine): JournalLineitem {
  return {
    accountId: row.account_code || undefined,
    description: row.description || undefined,
    debitAmount: row.debit_amount || undefined,
    creditAmount: row.credit_amount || undefined,
  }
}

export function transformJournal(raw: SistemiJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
