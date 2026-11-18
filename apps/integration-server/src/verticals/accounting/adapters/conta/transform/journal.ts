import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ContaJournalEntry {
  id: string
  account_id?: string
  description?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export interface ContaJournal {
  id: string
  date?: string
  description?: string
  entries?: ContaJournalEntry[]
  [key: string]: unknown
}

function mapEntry(entry: ContaJournalEntry): JournalLineitem {
  return {
    id: entry.id,
    accountId: entry.account_id || undefined,
    description: entry.description || undefined,
    debitAmount: entry.debit || undefined,
    creditAmount: entry.credit || undefined,
  }
}

export function transformJournal(raw: ContaJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    lineItems: (raw.entries ?? []).map(mapEntry),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
