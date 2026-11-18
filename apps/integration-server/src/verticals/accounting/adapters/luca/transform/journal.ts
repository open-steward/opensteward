import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'
import { nonempty } from '../../shared/transform'

export interface LucaJournalEntry {
  id: string
  account_no?: string
  description?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export interface LucaJournal {
  id: string
  date?: string
  description?: string
  entries?: LucaJournalEntry[]
  [key: string]: unknown
}

function mapEntry(entry: LucaJournalEntry): JournalLineitem {
  return {
    id: entry.id,
    accountId: entry.account_no || undefined,
    description: entry.description || undefined,
    debitAmount: entry.debit || undefined,
    creditAmount: entry.credit || undefined,
  }
}

export function transformJournal(raw: LucaJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    lineItems: nonempty((raw.entries ?? []).map(mapEntry)),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
