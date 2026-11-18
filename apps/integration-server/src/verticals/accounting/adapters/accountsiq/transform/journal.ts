import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface AccountsIQJournalLine {
  lineId: string | number
  accountCode: string
  description: string
  debitAmount: number
  creditAmount: number
  [key: string]: unknown
}

export interface AccountsIQJournal {
  journalId: string | number
  entityId: string | number
  journalDate: string
  description: string
  lines: AccountsIQJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: AccountsIQJournalLine): JournalLineitem {
  return {
    id: String(line.lineId),
    accountId: line.accountCode || undefined,
    description: line.description || undefined,
    debitAmount: line.debitAmount || undefined,
    creditAmount: line.creditAmount || undefined,
  }
}

export function transformJournal(raw: AccountsIQJournal): Journal {
  return {
    id: String(raw.journalId),
    description: raw.description || undefined,
    lineItems: (raw.lines ?? []).map(mapJournalLine),
    postedAt: raw.journalDate ? new Date(raw.journalDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
