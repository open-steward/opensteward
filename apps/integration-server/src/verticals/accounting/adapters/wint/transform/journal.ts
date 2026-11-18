import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface WintJournalEntry {
  account?: string | number
  debit?: number
  credit?: number
  description?: string
  [key: string]: unknown
}

export interface WintJournal {
  id: number | string
  date?: string
  description?: string
  entries?: WintJournalEntry[]
  [key: string]: unknown
}

function mapEntry(entry: WintJournalEntry): JournalLineitem {
  return {
    accountId: entry.account != null ? String(entry.account) : undefined,
    description: entry.description || undefined,
    debitAmount: entry.debit || undefined,
    creditAmount: entry.credit || undefined,
  }
}

export function transformJournal(raw: WintJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    lineItems: (raw.entries ?? []).map(mapEntry),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
