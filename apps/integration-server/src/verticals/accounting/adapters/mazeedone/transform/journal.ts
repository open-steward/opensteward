import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface MazeedOneJournalLine {
  account_id: string | number
  debit: number
  credit: number
  description: string
  [key: string]: unknown
}

export interface MazeedOneJournal {
  id: string | number
  date: string
  description: string
  reference: string
  lines: MazeedOneJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: MazeedOneJournalLine): JournalLineitem {
  return {
    accountId: line.account_id ? String(line.account_id) : undefined,
    description: line.description || undefined,
    debitAmount: line.debit || undefined,
    creditAmount: line.credit || undefined,
  }
}

export function transformJournal(raw: MazeedOneJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapJournalLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
