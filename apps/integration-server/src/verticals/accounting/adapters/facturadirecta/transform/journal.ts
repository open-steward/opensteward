import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface FacturadirectaJournalLine {
  account_id: string
  description: string
  debit_amount: number
  credit_amount: number
  [key: string]: unknown
}

export interface FacturadirectaJournal {
  id: string
  reference: string
  description: string
  document_date: string
  lines: FacturadirectaJournalLine[]
  [key: string]: unknown
}

function mapLine(line: FacturadirectaJournalLine): JournalLineitem {
  return {
    accountId: line.account_id || undefined,
    description: line.description || undefined,
    debitAmount: line.debit_amount || undefined,
    creditAmount: line.credit_amount || undefined,
  }
}

export function transformJournal(raw: FacturadirectaJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.document_date ? new Date(raw.document_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
