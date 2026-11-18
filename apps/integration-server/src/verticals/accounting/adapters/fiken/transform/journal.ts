import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface FikenJournalLine {
  accountCode: string
  debitAmount: number
  creditAmount: number
  description: string
  [key: string]: unknown
}

export interface FikenJournal {
  journalEntryId: number
  date: string
  description: string
  journalEntryNumber: string
  lines: FikenJournalLine[]
  [key: string]: unknown
}

function mapLine(row: FikenJournalLine): JournalLineitem {
  return {
    accountId: row.accountCode || undefined,
    description: row.description || undefined,
    debitAmount: row.debitAmount || undefined,
    creditAmount: row.creditAmount || undefined,
  }
}

export function transformJournal(raw: FikenJournal): Journal {
  return {
    id: String(raw.journalEntryId),
    description: raw.description || undefined,
    reference: raw.journalEntryNumber || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
