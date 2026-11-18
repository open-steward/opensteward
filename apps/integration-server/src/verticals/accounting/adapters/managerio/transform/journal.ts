import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ManagerioJournalLine {
  Account: string
  Debit: number
  Credit: number
  Description: string
  [key: string]: unknown
}

export interface ManagerioJournal {
  Key: string
  Date: string
  Description: string
  Reference: string
  Lines: ManagerioJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: ManagerioJournalLine): JournalLineitem {
  return {
    accountId: line.Account || undefined,
    description: line.Description || undefined,
    debitAmount: line.Debit || undefined,
    creditAmount: line.Credit || undefined,
  }
}

export function transformJournal(raw: ManagerioJournal): Journal {
  return {
    id: String(raw.Key),
    description: raw.Description || undefined,
    reference: raw.Reference || undefined,
    lineItems: (raw.Lines ?? []).map(mapJournalLine),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    Description: journal.description,
    Reference: journal.reference,
    Date: toCalendarDate(journal.postedAt),
    Lines: journal.lineItems?.map((li) => ({
      Account: li.accountId,
      Debit: li.debitAmount,
      Credit: li.creditAmount,
      Description: li.description,
    })),
  }
}
