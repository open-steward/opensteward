import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'
import { nonempty } from '../../shared/transform'

export interface SystimaJournalEntry {
  id: string
  accountNumber?: string
  description?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export interface SystimaJournal {
  id: string
  date?: string
  description?: string
  entries?: SystimaJournalEntry[]
  [key: string]: unknown
}

function mapEntry(entry: SystimaJournalEntry): JournalLineitem {
  return {
    id: entry.id,
    accountId: entry.accountNumber || undefined,
    description: entry.description || undefined,
    debitAmount: entry.debit || undefined,
    creditAmount: entry.credit || undefined,
  }
}

export function transformJournal(raw: SystimaJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    lineItems: nonempty((raw.entries ?? []).map(mapEntry)),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
