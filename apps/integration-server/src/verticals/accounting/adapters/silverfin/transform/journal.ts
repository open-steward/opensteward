import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface SilverfinJournalLine {
  id: string | number
  account_number: string
  description: string
  debit: number
  credit: number
  [key: string]: unknown
}

export interface SilverfinJournal {
  id: string | number
  period: string
  description: string
  lines: SilverfinJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: SilverfinJournalLine): JournalLineitem {
  return {
    id: String(line.id),
    accountId: line.account_number || undefined,
    description: line.description || undefined,
    debitAmount: line.debit || undefined,
    creditAmount: line.credit || undefined,
  }
}

export function transformJournal(raw: SilverfinJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    lineItems: (raw.lines ?? []).map(mapJournalLine),
    postedAt: raw.period ? new Date(raw.period) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
