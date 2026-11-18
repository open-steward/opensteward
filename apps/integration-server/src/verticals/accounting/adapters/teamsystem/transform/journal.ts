import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface TeamSystemJournalLine {
  accountCode: string
  description: string
  debitAmount: number
  creditAmount: number
  [key: string]: unknown
}

export interface TeamSystemJournal {
  id: string
  reference: string
  description: string
  date: string
  lines?: TeamSystemJournalLine[]
  [key: string]: unknown
}

function mapLineitem(row: TeamSystemJournalLine): JournalLineitem {
  return {
    accountId: row.accountCode || undefined,
    description: row.description || undefined,
    debitAmount: row.debitAmount || undefined,
    creditAmount: row.creditAmount || undefined,
  }
}

export function transformJournal(raw: TeamSystemJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
