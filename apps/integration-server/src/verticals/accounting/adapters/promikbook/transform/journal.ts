import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface PromikBookJournalEntry {
  account_no?: string | number
  debit?: number
  credit?: number
  description?: string
  [key: string]: unknown
}

export interface PromikBookJournal {
  id: number | string
  date?: string
  description?: string
  entries?: PromikBookJournalEntry[]
  [key: string]: unknown
}

function mapEntry(entry: PromikBookJournalEntry): JournalLineitem {
  return {
    accountId: entry.account_no !== undefined ? String(entry.account_no) : undefined,
    description: entry.description || undefined,
    debitAmount: entry.debit || undefined,
    creditAmount: entry.credit || undefined,
  }
}

export function transformJournal(raw: PromikBookJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    lineItems: (raw.entries ?? []).map(mapEntry),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
