import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface BillinJournalLine {
  account: string
  description: string
  debit: number
  credit: number
  [key: string]: unknown
}

export interface BillinJournal {
  id: string
  reference: string
  description: string
  date: string
  lines: BillinJournalLine[]
  [key: string]: unknown
}

function mapLine(line: BillinJournalLine): JournalLineitem {
  return {
    accountId: line.account || undefined,
    description: line.description || undefined,
    debitAmount: line.debit || undefined,
    creditAmount: line.credit || undefined,
  }
}

export function transformJournal(raw: BillinJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
