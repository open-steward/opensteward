import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface BluenextJournalLine {
  accountCode: string
  description: string
  debitAmount: number
  creditAmount: number
  [key: string]: unknown
}

export interface BluenextJournal {
  id: string
  reference: string
  description: string
  date: string
  lines?: BluenextJournalLine[]
  [key: string]: unknown
}

function mapLineitem(row: BluenextJournalLine): JournalLineitem {
  return {
    accountId: row.accountCode || undefined,
    description: row.description || undefined,
    debitAmount: row.debitAmount || undefined,
    creditAmount: row.creditAmount || undefined,
  }
}

export function transformJournal(raw: BluenextJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
