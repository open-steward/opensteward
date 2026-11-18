import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface InbooksJournalEntry {
  account_id?: number | string
  debit?: number
  credit?: number
  description?: string
  [key: string]: unknown
}

export interface InbooksJournal {
  id: number | string
  date?: string
  description?: string
  entries?: InbooksJournalEntry[]
  [key: string]: unknown
}

function mapEntry(entry: InbooksJournalEntry): JournalLineitem {
  return {
    accountId: entry.account_id !== undefined ? String(entry.account_id) : undefined,
    description: entry.description || undefined,
    debitAmount: entry.debit || undefined,
    creditAmount: entry.credit || undefined,
  }
}

export function transformJournal(raw: InbooksJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    lineItems: (raw.entries ?? []).map(mapEntry),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
