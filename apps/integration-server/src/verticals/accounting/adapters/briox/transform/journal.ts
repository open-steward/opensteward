import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface BrioxJournalEntry {
  account_number?: string | number
  debit?: number
  credit?: number
  description?: string
  [key: string]: unknown
}

export interface BrioxJournal {
  id: number | string
  date?: string
  description?: string
  entries?: BrioxJournalEntry[]
  [key: string]: unknown
}

function mapEntry(entry: BrioxJournalEntry): JournalLineitem {
  return {
    accountId: entry.account_number != null ? String(entry.account_number) : undefined,
    description: entry.description || undefined,
    debitAmount: entry.debit || undefined,
    creditAmount: entry.credit || undefined,
  }
}

export function transformJournal(raw: BrioxJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    lineItems: (raw.entries ?? []).map(mapEntry),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
