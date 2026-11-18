import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface FocusSoftnetJournalLine {
  AccCode: string
  Debit: number
  Credit: number
  Description: string
  [key: string]: unknown
}

export interface FocusSoftnetJournal {
  DocNo: string
  TransDate: string
  Description: string
  Ref: string
  Lines: FocusSoftnetJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: FocusSoftnetJournalLine): JournalLineitem {
  return {
    accountId: line.AccCode || undefined,
    description: line.Description || undefined,
    debitAmount: line.Debit || undefined,
    creditAmount: line.Credit || undefined,
  }
}

export function transformJournal(raw: FocusSoftnetJournal): Journal {
  return {
    id: String(raw.DocNo),
    description: raw.Description || undefined,
    reference: raw.Ref || undefined,
    lineItems: (raw.Lines ?? []).map(mapJournalLine),
    postedAt: raw.TransDate ? new Date(raw.TransDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    Description: journal.description,
    Ref: journal.reference,
    TransDate: toCalendarDate(journal.postedAt),
    Lines: journal.lineItems?.map((li) => ({
      AccCode: li.accountId,
      Debit: li.debitAmount,
      Credit: li.creditAmount,
      Description: li.description,
    })),
  }
}
