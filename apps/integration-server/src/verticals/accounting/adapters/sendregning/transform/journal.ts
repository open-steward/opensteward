import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface SendRegningJournalEntry {
  id: string
  accountNo?: string
  description?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export interface SendRegningJournal {
  id: string
  description?: string
  date?: string
  entries?: SendRegningJournalEntry[]
  [key: string]: unknown
}

function mapEntry(entry: SendRegningJournalEntry): JournalLineitem {
  return {
    id: entry.id,
    accountId: entry.accountNo || undefined,
    description: entry.description || undefined,
    debitAmount: entry.debit || undefined,
    creditAmount: entry.credit || undefined,
  }
}

export function transformJournal(raw: SendRegningJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    lineItems: (raw.entries ?? []).map(mapEntry),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
