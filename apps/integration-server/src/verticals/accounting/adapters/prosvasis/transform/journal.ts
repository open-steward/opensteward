import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ProsvasisJournalLine {
  Id: string | number
  AccountCode: string
  Description: string
  Debit: number
  Credit: number
  [key: string]: unknown
}

export interface ProsvasisJournal {
  id: string | number
  Date: string
  Description: string
  Lines: ProsvasisJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: ProsvasisJournalLine): JournalLineitem {
  return {
    id: String(line.Id),
    accountId: line.AccountCode || undefined,
    description: line.Description || undefined,
    debitAmount: line.Debit || undefined,
    creditAmount: line.Credit || undefined,
  }
}

export function transformJournal(raw: ProsvasisJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.Description || undefined,
    lineItems: (raw.Lines ?? []).map(mapJournalLine),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
