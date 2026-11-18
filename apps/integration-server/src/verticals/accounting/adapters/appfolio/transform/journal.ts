import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface AppFolioJournalLine {
  id: string | number
  account_id: string | number
  description: string
  debit: number
  credit: number
  property_id: string | number
  [key: string]: unknown
}

export interface AppFolioJournal {
  id: string | number
  date: string
  description: string
  reference: string
  lines: AppFolioJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: AppFolioJournalLine): JournalLineitem {
  return {
    id: String(line.id),
    accountId: line.account_id ? String(line.account_id) : undefined,
    description: line.description || undefined,
    debitAmount: line.debit || undefined,
    creditAmount: line.credit || undefined,
  }
}

export function transformJournal(raw: AppFolioJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapJournalLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
