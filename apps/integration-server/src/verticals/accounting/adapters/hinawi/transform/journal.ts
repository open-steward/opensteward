import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface HinawiJournalLine {
  AccountId: string | number
  Debit: number
  Credit: number
  Description: string
  [key: string]: unknown
}

export interface HinawiJournal {
  id: string | number
  Date: string
  Description: string
  Reference: string
  Lines: HinawiJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: HinawiJournalLine): JournalLineitem {
  return {
    accountId: line.AccountId ? String(line.AccountId) : undefined,
    description: line.Description || undefined,
    debitAmount: line.Debit || undefined,
    creditAmount: line.Credit || undefined,
  }
}

export function transformJournal(raw: HinawiJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.Description || undefined,
    reference: raw.Reference || undefined,
    lineItems: (raw.Lines ?? []).map(mapJournalLine),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
