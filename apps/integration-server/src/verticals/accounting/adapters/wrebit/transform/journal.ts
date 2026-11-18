import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface WrebitJournalEntry {
  account?: string | number
  debit?: number
  credit?: number
  description?: string
  [key: string]: unknown
}

export interface WrebitJournal {
  id: number | string
  date?: string
  description?: string
  entries?: WrebitJournalEntry[]
  [key: string]: unknown
}

function mapEntry(entry: WrebitJournalEntry): JournalLineitem {
  return {
    accountId: entry.account !== undefined ? String(entry.account) : undefined,
    description: entry.description || undefined,
    debitAmount: entry.debit || undefined,
    creditAmount: entry.credit || undefined,
  }
}

export function transformJournal(raw: WrebitJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    lineItems: (raw.entries ?? []).map(mapEntry),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
