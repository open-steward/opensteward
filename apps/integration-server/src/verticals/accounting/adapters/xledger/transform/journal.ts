import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface XledgerJournalLine {
  id: string
  accountCode?: string
  description?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export interface XledgerJournal {
  id: string
  description?: string
  transactionDate?: string
  lines?: XledgerJournalLine[]
  [key: string]: unknown
}

function mapLine(line: XledgerJournalLine): JournalLineitem {
  return {
    accountId: line.accountCode || undefined,
    description: line.description || undefined,
    debitAmount: line.debit || undefined,
    creditAmount: line.credit || undefined,
  }
}

export function transformJournal(raw: XledgerJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    transactionDate: toCalendarDate(journal.postedAt),
    description: journal.description,
    lines: journal.lineItems?.map((li) => ({
      accountCode: li.accountId,
      debit: li.debitAmount,
      credit: li.creditAmount,
      description: li.description,
    })),
  }
}
