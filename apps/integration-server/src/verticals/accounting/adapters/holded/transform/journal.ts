import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface HoldedJournalLine {
  id: string
  accountId: string
  description: string
  debit: number
  credit: number
  contactId: string
  [key: string]: unknown
}

export interface HoldedJournal {
  id: string
  date: number
  description: string
  reference: string
  currency: string
  lines: HoldedJournalLine[]
  [key: string]: unknown
}

function mapLine(row: HoldedJournalLine): JournalLineitem {
  return {
    id: row.id,
    accountId: row.accountId || undefined,
    contactId: row.contactId || undefined,
    description: row.description || undefined,
    debitAmount: row.debit || undefined,
    creditAmount: row.credit || undefined,
  }
}

export function transformJournal(raw: HoldedJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date * 1000) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
