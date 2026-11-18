import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ZohoBooksJournalLine {
  line_item_id: string
  account_id: string
  account_name: string
  debit_or_credit: 'debit' | 'credit'
  amount: number
  description: string
}

export interface ZohoBooksJournalEntry {
  journal_id: string
  journal_date: string
  reference_number: string
  notes: string
  line_items: ZohoBooksJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: ZohoBooksJournalLine): JournalLineitem {
  return {
    id: line.line_item_id || undefined,
    accountId: line.account_id || undefined,
    description: line.description || undefined,
    debitAmount: line.debit_or_credit === 'debit' ? line.amount : undefined,
    creditAmount: line.debit_or_credit === 'credit' ? line.amount : undefined,
  }
}

export function transformJournal(raw: ZohoBooksJournalEntry): Journal {
  return {
    id: raw.journal_id,
    description: raw.notes || undefined,
    reference: raw.reference_number || undefined,
    lineItems: (raw.line_items ?? []).map(mapJournalLine),
    postedAt: raw.journal_date ? new Date(raw.journal_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
