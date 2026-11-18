import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface AkauntingJournalLine {
  id: number
  account_id: number
  description: string
  debit: number
  credit: number
  [key: string]: unknown
}

export interface AkauntingJournal {
  id: number
  paid_at: string
  description: string
  reference: string
  items: AkauntingJournalLine[]
  [key: string]: unknown
}

function mapLine(row: AkauntingJournalLine): JournalLineitem {
  return {
    id: String(row.id),
    accountId: row.account_id ? String(row.account_id) : undefined,
    description: row.description || undefined,
    debitAmount: row.debit || undefined,
    creditAmount: row.credit || undefined,
  }
}

export function transformJournal(raw: AkauntingJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.items ?? []).map(mapLine),
    postedAt: raw.paid_at ? new Date(raw.paid_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
