import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ProcountorJournalRow {
  id: number
  accountNumber: string
  description: string
  debit: number
  credit: number
  [key: string]: unknown
}

export interface ProcountorJournalEntry {
  id: number
  description: string
  voucherNumber: number
  date: string
  rows: ProcountorJournalRow[]
  [key: string]: unknown
}

function mapRow(row: ProcountorJournalRow): JournalLineitem {
  return {
    id: String(row.id),
    accountId: row.accountNumber || undefined,
    description: row.description || undefined,
    debitAmount: row.debit || undefined,
    creditAmount: row.credit || undefined,
  }
}

export function transformJournal(raw: ProcountorJournalEntry): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.voucherNumber ? String(raw.voucherNumber) : undefined,
    lineItems: (raw.rows ?? []).map(mapRow),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
