import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface FinancioJournalEntry {
  id: string | number
  account_code: string
  account_name: string
  debit: number
  credit: number
  description: string
  [key: string]: unknown
}

export interface FinancioJournal {
  id: string | number
  reference: string
  date: string
  description: string
  entries: FinancioJournalEntry[]
  [key: string]: unknown
}

function mapJournalEntry(entry: FinancioJournalEntry): JournalLineitem {
  return {
    id: String(entry.id),
    description: entry.description || undefined,
    debitAmount: entry.debit || undefined,
    creditAmount: entry.credit || undefined,
  }
}

export function transformJournal(raw: FinancioJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.entries ?? []).map(mapJournalEntry),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
