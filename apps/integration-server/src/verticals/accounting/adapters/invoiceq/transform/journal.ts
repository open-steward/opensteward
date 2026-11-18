import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface InvoiceqJournalLine {
  account_id?: string
  debit?: number
  credit?: number
  description?: string
  [key: string]: unknown
}

export interface InvoiceqJournal {
  id: string
  date?: string
  description?: string
  reference?: string
  line_items?: InvoiceqJournalLine[]
  [key: string]: unknown
}

function mapLineitem(line: InvoiceqJournalLine): JournalLineitem {
  return {
    accountId: line.account_id ? String(line.account_id) : undefined,
    description: line.description || undefined,
    debitAmount: line.debit,
    creditAmount: line.credit,
  }
}

export function transformJournal(raw: InvoiceqJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
