import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface MoloniJournalLine {
  account_id: number
  description: string
  debit: number
  credit: number
  [key: string]: unknown
}

export interface MoloniJournal {
  journal_entry_id: number
  date: string
  description: string
  lines: MoloniJournalLine[]
  [key: string]: unknown
}

function mapLineitem(line: MoloniJournalLine): JournalLineitem {
  return {
    accountId: line.account_id ? String(line.account_id) : undefined,
    description: line.description || undefined,
    debitAmount: line.debit,
    creditAmount: line.credit,
  }
}

export function transformJournal(raw: MoloniJournal): Journal {
  return {
    id: String(raw.journal_entry_id),
    description: raw.description || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    metadata: raw as Record<string, unknown>,
  }
}
