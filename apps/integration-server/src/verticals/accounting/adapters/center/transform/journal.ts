import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface CenterJournalLine {
  id: string
  accountId: string
  description: string
  debit: number
  credit: number
  contactId: string
  [key: string]: unknown
}

export interface CenterJournal {
  id: string
  date: string
  description: string
  reference: string
  currency: string
  lines: CenterJournalLine[]
  [key: string]: unknown
}

function mapLine(row: CenterJournalLine): JournalLineitem {
  return {
    id: row.id,
    accountId: row.accountId || undefined,
    contactId: row.contactId || undefined,
    description: row.description || undefined,
    debitAmount: row.debit || undefined,
    creditAmount: row.credit || undefined,
  }
}

export function transformJournal(raw: CenterJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
