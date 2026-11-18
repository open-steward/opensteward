import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface SinaoJournalLine {
  account_id: string
  description: string
  debit: number
  credit: number
  [key: string]: unknown
}

export interface SinaoJournal {
  id: string
  description: string
  reference: string
  date: string
  lines: SinaoJournalLine[]
  [key: string]: unknown
}

function mapLine(line: SinaoJournalLine): JournalLineitem {
  return {
    accountId: line.account_id || undefined,
    description: line.description || undefined,
    debitAmount: line.debit || undefined,
    creditAmount: line.credit || undefined,
  }
}

export function transformJournal(raw: SinaoJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
