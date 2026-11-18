import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface SageJournalLine {
  id?: string
  ledger_account?: { id?: string }
  description?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export interface SageJournal {
  id: string
  reference?: string
  date?: string
  journal_lines?: SageJournalLine[]
  [key: string]: unknown
}

function mapLineitem(item: SageJournalLine): JournalLineitem {
  return {
    id: item.id ? String(item.id) : undefined,
    accountId: item.ledger_account?.id || undefined,
    description: item.description || undefined,
    debitAmount: item.debit || undefined,
    creditAmount: item.credit || undefined,
  }
}

export function transformJournal(raw: SageJournal): Journal {
  return {
    id: raw.id,
    reference: raw.reference || undefined,
    lineItems: (raw.journal_lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
