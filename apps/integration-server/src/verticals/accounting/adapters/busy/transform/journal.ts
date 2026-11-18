import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface BusyJournalLine {
  AccCode: string
  Debit: number
  Credit: number
  Narration: string
  [key: string]: unknown
}

export interface BusyJournal {
  VoucherNo: string
  Date: string
  Narration: string
  Reference: string
  Lines: BusyJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: BusyJournalLine): JournalLineitem {
  return {
    accountId: line.AccCode || undefined,
    description: line.Narration || undefined,
    debitAmount: line.Debit || undefined,
    creditAmount: line.Credit || undefined,
  }
}

export function transformJournal(raw: BusyJournal): Journal {
  return {
    id: String(raw.VoucherNo),
    description: raw.Narration || undefined,
    reference: raw.Reference || undefined,
    lineItems: (raw.Lines ?? []).map(mapJournalLine),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    Narration: journal.description,
    Reference: journal.reference,
    Date: toCalendarDate(journal.postedAt),
    Lines: journal.lineItems?.map((li) => ({
      AccCode: li.accountId,
      Debit: li.debitAmount,
      Credit: li.creditAmount,
      Narration: li.description,
    })),
  }
}
