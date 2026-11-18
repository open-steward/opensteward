import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface BexioJournalLine {
  id: string
  account_id: number
  contact_id: number | null
  description: string
  debit_amount: number
  credit_amount: number
  tax_amount: number
  [key: string]: unknown
}

export interface BexioJournal {
  id: number
  date: string
  description: string
  reference: string
  lines: BexioJournalLine[]
  [key: string]: unknown
}

function mapLine(row: BexioJournalLine): JournalLineitem {
  return {
    id: String(row.id),
    accountId: row.account_id ? String(row.account_id) : undefined,
    contactId: row.contact_id ? String(row.contact_id) : undefined,
    description: row.description || undefined,
    debitAmount: row.debit_amount || undefined,
    creditAmount: row.credit_amount || undefined,
    taxAmount: row.tax_amount || undefined,
  }
}

export function transformJournal(raw: BexioJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
