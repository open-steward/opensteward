import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface SuperbillJournalLine {
  account_code: string
  description: string
  debit_amount: number
  credit_amount: number
  [key: string]: unknown
}

export interface SuperbillJournal {
  id: string
  reference: string
  description: string
  date: string
  lines?: SuperbillJournalLine[]
  [key: string]: unknown
}

function mapLineitem(row: SuperbillJournalLine): JournalLineitem {
  return {
    accountId: row.account_code || undefined,
    description: row.description || undefined,
    debitAmount: row.debit_amount || undefined,
    creditAmount: row.credit_amount || undefined,
  }
}

export function transformJournal(raw: SuperbillJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
