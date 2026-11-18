import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ZipBooksJournalLine {
  id: string
  account_id: string
  description: string
  debit: number
  credit: number
  contact_id: string
  [key: string]: unknown
}

export interface ZipBooksJournal {
  id: string
  date: string
  description: string
  reference: string
  currency: string
  lines: ZipBooksJournalLine[]
  [key: string]: unknown
}

function mapLine(row: ZipBooksJournalLine): JournalLineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    contactId: row.contact_id || undefined,
    description: row.description || undefined,
    debitAmount: row.debit || undefined,
    creditAmount: row.credit || undefined,
  }
}

export function transformJournal(raw: ZipBooksJournal): Journal {
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
