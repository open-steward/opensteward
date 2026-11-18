import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ClearJournalLine {
  id: string
  account_id: string
  account_name: string
  debit_amount: number
  credit_amount: number
  description: string
  cost_center: string
  [key: string]: unknown
}

export interface ClearJournalEntry {
  id: string
  reference_number: string
  date: string
  narration: string
  journal_lines: ClearJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: ClearJournalLine): JournalLineitem {
  return {
    id: line.id,
    accountId: line.account_id || undefined,
    description: line.description || undefined,
    debitAmount: line.debit_amount || undefined,
    creditAmount: line.credit_amount || undefined,
  }
}

export function transformJournal(raw: ClearJournalEntry): Journal {
  return {
    id: raw.id,
    description: raw.narration || undefined,
    reference: raw.reference_number || undefined,
    lineItems: (raw.journal_lines ?? []).map(mapJournalLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
