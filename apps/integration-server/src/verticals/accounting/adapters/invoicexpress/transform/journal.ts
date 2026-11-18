import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface InvoiceXpressJournalLine {
  account_id: number
  description: string
  debit: number
  credit: number
  [key: string]: unknown
}

export interface InvoiceXpressJournal {
  id: number
  date: string
  description: string
  currency: string
  lines: InvoiceXpressJournalLine[]
  [key: string]: unknown
}

function mapLineitem(line: InvoiceXpressJournalLine): JournalLineitem {
  return {
    accountId: line.account_id ? String(line.account_id) : undefined,
    description: line.description || undefined,
    debitAmount: line.debit,
    creditAmount: line.credit,
  }
}

export function transformJournal(raw: InvoiceXpressJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    currency: raw.currency || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    metadata: raw as Record<string, unknown>,
  }
}
