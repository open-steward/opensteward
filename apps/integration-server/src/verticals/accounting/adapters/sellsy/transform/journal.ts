import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface SellsyJournalLine {
  id: string
  account_id: string
  description: string
  debit: number
  credit: number
  tax_amount: number
  contact_id: string
  [key: string]: unknown
}

export interface SellsyJournal {
  id: string
  date: string
  description: string
  reference: string
  currency: string
  lines: SellsyJournalLine[]
  [key: string]: unknown
}

function mapLine(row: SellsyJournalLine): JournalLineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    contactId: row.contact_id || undefined,
    description: row.description || undefined,
    debitAmount: row.debit || undefined,
    creditAmount: row.credit || undefined,
    taxAmount: row.tax_amount || undefined,
  }
}

export function transformJournal(raw: SellsyJournal): Journal {
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
