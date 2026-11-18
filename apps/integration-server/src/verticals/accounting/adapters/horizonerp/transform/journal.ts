import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface HorizonErpJournalLine {
  account_id: string
  debit: number
  credit: number
  description: string
  [key: string]: unknown
}

export interface HorizonErpJournal {
  id: string
  date: string
  narration: string
  reference: string
  lines: HorizonErpJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: HorizonErpJournalLine): JournalLineitem {
  return {
    accountId: line.account_id || undefined,
    description: line.description || undefined,
    debitAmount: line.debit || undefined,
    creditAmount: line.credit || undefined,
  }
}

export function transformJournal(raw: HorizonErpJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.narration || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapJournalLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    narration: journal.description,
    reference: journal.reference,
    date: toCalendarDate(journal.postedAt),
    lines: journal.lineItems?.map((li) => ({
      account_id: li.accountId,
      debit: li.debitAmount,
      credit: li.creditAmount,
      description: li.description,
    })),
  }
}
