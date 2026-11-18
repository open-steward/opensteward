import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface PandleJournalLine {
  id: number
  account_id: number
  contact_id: number
  description: string
  debit: number
  credit: number
  tax_amount: number
  [key: string]: unknown
}

export interface PandleJournal {
  id: number
  date: string
  description: string
  reference: string
  journal_lines: PandleJournalLine[]
  [key: string]: unknown
}

function mapLine(row: PandleJournalLine): JournalLineitem {
  return {
    id: String(row.id),
    accountId: row.account_id ? String(row.account_id) : undefined,
    contactId: row.contact_id ? String(row.contact_id) : undefined,
    description: row.description || undefined,
    debitAmount: row.debit || undefined,
    creditAmount: row.credit || undefined,
    taxAmount: row.tax_amount || undefined,
  }
}

export function transformJournal(raw: PandleJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.journal_lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
