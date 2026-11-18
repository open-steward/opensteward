import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface PeakAccountJournalEntry {
  id: string | number
  accountCode: string
  debit: number
  credit: number
  description: string
  [key: string]: unknown
}

export interface PeakAccountJournal {
  id: string | number
  date: string
  description: string
  entries: PeakAccountJournalEntry[]
  [key: string]: unknown
}

function mapJournalLineitem(entry: PeakAccountJournalEntry): JournalLineitem {
  return {
    id: String(entry.id),
    accountId: entry.accountCode || undefined,
    description: entry.description || undefined,
    debitAmount: entry.debit || undefined,
    creditAmount: entry.credit || undefined,
  }
}

export function transformJournal(raw: PeakAccountJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    lineItems: (raw.entries ?? []).map(mapJournalLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
