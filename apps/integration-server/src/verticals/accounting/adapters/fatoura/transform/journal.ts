import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface FatouaJournalLine {
  account_id?: string
  debit?: number
  credit?: number
  description?: string
  [key: string]: unknown
}

export interface FatouaJournal {
  id: string
  date?: string
  description?: string
  reference?: string
  lines?: FatouaJournalLine[]
  [key: string]: unknown
}

function mapLineitem(line: FatouaJournalLine): JournalLineitem {
  return {
    accountId: line.account_id ? String(line.account_id) : undefined,
    description: line.description || undefined,
    debitAmount: line.debit,
    creditAmount: line.credit,
  }
}

export function transformJournal(raw: FatouaJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
