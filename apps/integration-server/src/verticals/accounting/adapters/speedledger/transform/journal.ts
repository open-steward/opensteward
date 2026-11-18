import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface SpeedLedgerJournalEntry {
  accountNumber?: string | number
  debit?: number
  credit?: number
  description?: string
  [key: string]: unknown
}

export interface SpeedLedgerJournal {
  id: number | string
  date?: string
  description?: string
  entries?: SpeedLedgerJournalEntry[]
  [key: string]: unknown
}

function mapEntry(entry: SpeedLedgerJournalEntry): JournalLineitem {
  return {
    accountId: entry.accountNumber !== undefined ? String(entry.accountNumber) : undefined,
    description: entry.description || undefined,
    debitAmount: entry.debit || undefined,
    creditAmount: entry.credit || undefined,
  }
}

export function transformJournal(raw: SpeedLedgerJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    lineItems: (raw.entries ?? []).map(mapEntry),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
