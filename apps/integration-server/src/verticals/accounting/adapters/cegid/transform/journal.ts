import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface CegidJournalLine {
  accountId: string
  description: string
  debitAmount: number
  creditAmount: number
  [key: string]: unknown
}

export interface CegidJournal {
  id: string
  description: string
  reference: string
  transactionDate: string
  lines: CegidJournalLine[]
  [key: string]: unknown
}

function mapLine(line: CegidJournalLine): JournalLineitem {
  return {
    accountId: line.accountId || undefined,
    description: line.description || undefined,
    debitAmount: line.debitAmount || undefined,
    creditAmount: line.creditAmount || undefined,
  }
}

export function transformJournal(raw: CegidJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
