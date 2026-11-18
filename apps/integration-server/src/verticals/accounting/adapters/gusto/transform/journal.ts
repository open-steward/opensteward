import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface GustoJournalLine {
  id: string | number
  account_id: string | number
  description: string
  debit_amount: number
  credit_amount: number
  [key: string]: unknown
}

export interface GustoJournal {
  id: string | number
  date: string
  description: string
  payroll_run_id?: string | number
  lines: GustoJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: GustoJournalLine): JournalLineitem {
  return {
    id: String(line.id),
    accountId: line.account_id ? String(line.account_id) : undefined,
    description: line.description || undefined,
    debitAmount: line.debit_amount || undefined,
    creditAmount: line.credit_amount || undefined,
  }
}

export function transformJournal(raw: GustoJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    lineItems: (raw.lines ?? []).map(mapJournalLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
