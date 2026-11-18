import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface FakturoidJournalLine {
  id: number
  account_id: number
  description: string
  debit: number
  credit: number
  [key: string]: unknown
}

export interface FakturoidJournal {
  id: number
  document_number: string
  description: string
  date: string
  lines: FakturoidJournalLine[]
  [key: string]: unknown
}

function mapLine(row: FakturoidJournalLine): JournalLineitem {
  return {
    id: String(row.id),
    accountId: row.account_id ? String(row.account_id) : undefined,
    description: row.description || undefined,
    debitAmount: row.debit || undefined,
    creditAmount: row.credit || undefined,
  }
}

export function transformJournal(raw: FakturoidJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.document_number || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
