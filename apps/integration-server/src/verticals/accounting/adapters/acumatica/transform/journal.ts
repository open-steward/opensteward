import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface AcumaticaJournalLine {
  LineNbr: number
  AccountID: string
  Description: string
  DebitAmt: number
  CreditAmt: number
  [key: string]: unknown
}

export interface AcumaticaJournal {
  BatchNbr: string
  Description: string
  DateEntered: string
  Details: AcumaticaJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: AcumaticaJournalLine): JournalLineitem {
  return {
    id: String(line.LineNbr),
    accountId: line.AccountID || undefined,
    description: line.Description || undefined,
    debitAmount: line.DebitAmt || undefined,
    creditAmount: line.CreditAmt || undefined,
  }
}

export function transformJournal(raw: AcumaticaJournal): Journal {
  return {
    id: raw.BatchNbr,
    description: raw.Description || undefined,
    lineItems: (raw.Details ?? []).map(mapJournalLine),
    postedAt: raw.DateEntered ? new Date(raw.DateEntered) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(data: Partial<Journal>): Record<string, unknown> {
  return {
    Description: data.description,
    DateEntered: toCalendarDate(data.postedAt),
    Details: data.lineItems?.map((li) => ({
      AccountID: li.accountId,
      Description: li.description,
      DebitAmt: li.debitAmount,
      CreditAmt: li.creditAmount,
    })),
  }
}
