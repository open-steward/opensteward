import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface PEAccountingJournalLine {
  account_id?: number | string
  description?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export interface PEAccountingJournalEntry {
  id: number | string
  date?: string
  description?: string
  reference?: string
  lines?: PEAccountingJournalLine[]
  [key: string]: unknown
}

function mapLineitem(line: PEAccountingJournalLine): JournalLineitem {
  return {
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
    description: line.description || undefined,
    debitAmount: line.debit || undefined,
    creditAmount: line.credit || undefined,
  }
}

export function transformJournal(raw: PEAccountingJournalEntry): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
