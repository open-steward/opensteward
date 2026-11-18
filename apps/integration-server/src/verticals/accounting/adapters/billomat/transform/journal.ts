import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface BillomatJournalLine {
  id: string
  account_id: string
  description: string
  debit: number
  credit: number
  tax_amount: number
  [key: string]: unknown
}

export interface BillomatJournal {
  id: string
  date: string
  description: string
  reference: string
  lines: BillomatJournalLine[]
  [key: string]: unknown
}

function mapLine(row: BillomatJournalLine): JournalLineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    description: row.description || undefined,
    debitAmount: row.debit || undefined,
    creditAmount: row.credit || undefined,
    taxAmount: row.tax_amount || undefined,
  }
}

export function transformJournal(raw: BillomatJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
