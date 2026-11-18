import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface VismaBusinessNxtJournalLine {
  id: string
  accountNumber?: string
  description?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export interface VismaBusinessNxtJournal {
  id: string
  date?: string
  description?: string
  lines?: VismaBusinessNxtJournalLine[]
  [key: string]: unknown
}

function mapLine(line: VismaBusinessNxtJournalLine): JournalLineitem {
  return {
    accountId: line.accountNumber || undefined,
    description: line.description || undefined,
    debitAmount: line.debit || undefined,
    creditAmount: line.credit || undefined,
  }
}

export function transformJournal(raw: VismaBusinessNxtJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    date: toCalendarDate(journal.postedAt),
    description: journal.description,
    lines: journal.lineItems?.map((li) => ({
      accountNumber: li.accountId,
      debit: li.debitAmount,
      credit: li.creditAmount,
      description: li.description,
    })),
  }
}
