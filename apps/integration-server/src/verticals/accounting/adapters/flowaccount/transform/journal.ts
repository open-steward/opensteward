import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface FlowAccountJournalLine {
  id: string | number
  accountCode: string
  description: string
  debit: number
  credit: number
  [key: string]: unknown
}

export interface FlowAccountJournal {
  id: string | number
  date: string
  description: string
  lines: FlowAccountJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: FlowAccountJournalLine): JournalLineitem {
  return {
    id: String(line.id),
    accountId: line.accountCode || undefined,
    description: line.description || undefined,
    debitAmount: line.debit || undefined,
    creditAmount: line.credit || undefined,
  }
}

export function transformJournal(raw: FlowAccountJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    lineItems: (raw.lines ?? []).map(mapJournalLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
