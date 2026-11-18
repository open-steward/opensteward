import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface LibeoJournalLine {
  account_id: string
  label: string
  debit: number
  credit: number
  [key: string]: unknown
}

export interface LibeoJournal {
  id: string
  label: string
  reference: string
  date: string
  lines: LibeoJournalLine[]
  [key: string]: unknown
}

function mapLine(line: LibeoJournalLine): JournalLineitem {
  return {
    accountId: line.account_id || undefined,
    description: line.label || undefined,
    debitAmount: line.debit || undefined,
    creditAmount: line.credit || undefined,
  }
}

export function transformJournal(raw: LibeoJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.label || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
