import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface QoyodJournalEntryLine {
  id?: number | null
  account_id?: number | null
  description?: string | null
  debit?: number | null
  credit?: number | null
  [key: string]: unknown
}

// Qoyod "journal entries"
export interface QoyodJournalEntry {
  id: number
  reference?: string | null
  description?: string | null
  date?: string | null
  journal_entry_lines?: QoyodJournalEntryLine[]
  [key: string]: unknown
}

function mapLine(line: QoyodJournalEntryLine): JournalLineitem {
  return {
    accountId: line.account_id != null ? String(line.account_id) : undefined,
    description: line.description || undefined,
    debitAmount: line.debit ?? undefined,
    creditAmount: line.credit ?? undefined,
  }
}

export function transformJournal(raw: QoyodJournalEntry): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.journal_entry_lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    reference: journal.reference,
    description: journal.description,
    date: toCalendarDate(journal.postedAt),
    journal_entry_lines: journal.lineItems?.map((li) => ({
      account_id: li.accountId ? Number(li.accountId) : undefined,
      description: li.description,
      debit: li.debitAmount,
      credit: li.creditAmount,
    })),
  }
}
