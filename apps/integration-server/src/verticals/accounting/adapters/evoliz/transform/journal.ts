import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface EvolizJournalLine {
  account_code: string
  label: string
  debit: number
  credit: number
  [key: string]: unknown
}

export interface EvolizJournal {
  id: string
  label: string
  reference: string
  date: string
  lines: EvolizJournalLine[]
  [key: string]: unknown
}

function mapLine(line: EvolizJournalLine): JournalLineitem {
  return {
    accountId: line.account_code || undefined,
    description: line.label || undefined,
    debitAmount: line.debit || undefined,
    creditAmount: line.credit || undefined,
  }
}

export function transformJournal(raw: EvolizJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.label || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
