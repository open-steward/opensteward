import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface FacturamaJournalLine {
  AccountCode: string
  Debit: number
  Credit: number
  Description: string
  CostCenter: string
  [key: string]: unknown
}

export interface FacturamaJournal {
  Id: string
  Description: string
  Date: string
  Reference: string
  Lines: FacturamaJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(row: FacturamaJournalLine): JournalLineitem {
  return {
    accountId: row.AccountCode || undefined,
    description: row.Description || undefined,
    debitAmount: row.Debit || undefined,
    creditAmount: row.Credit || undefined,
    groupId: row.CostCenter || undefined,
  }
}

export function transformJournal(raw: FacturamaJournal): Journal {
  return {
    id: String(raw.Id),
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
    Date: toCalendarDate(journal.postedAt),
    Lines: journal.lineItems?.map((li) => ({
      AccountCode: li.accountId,
      Debit: li.debitAmount,
      Credit: li.creditAmount,
      Description: li.description,
      CostCenter: li.groupId,
    })),
  }
}
