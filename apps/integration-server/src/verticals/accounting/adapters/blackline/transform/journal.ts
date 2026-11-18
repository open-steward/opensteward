import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface BlacklineJournalLine {
  lineId: string
  accountId: string
  description: string
  debitAmount: number
  creditAmount: number
  [key: string]: unknown
}

export interface BlacklineJournal {
  journalId: string
  description: string
  postedDate: string
  status: string
  createdBy: string
  createdAt: string
  modifiedBy: string
  modifiedAt: string
  lines: BlacklineJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: BlacklineJournalLine): JournalLineitem {
  return {
    id: line.lineId,
    accountId: line.accountId || undefined,
    description: line.description || undefined,
    debitAmount: line.debitAmount || undefined,
    creditAmount: line.creditAmount || undefined,
  }
}

export function transformJournal(raw: BlacklineJournal): Journal {
  return {
    id: String(raw.journalId),
    description: raw.description || undefined,
    lineItems: (raw.lines ?? []).map(mapJournalLine),
    postedAt: raw.postedDate ? new Date(raw.postedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
