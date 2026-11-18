import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface AlegraJournalEntry {
  accountId: number
  description: string
  debit: number
  credit: number
  costCenterId: number
  [key: string]: unknown
}

export interface AlegraJournal {
  id: number
  description: string
  reference: string
  date: string
  entries: AlegraJournalEntry[]
  [key: string]: unknown
}

function mapLineitem(row: AlegraJournalEntry): JournalLineitem {
  return {
    accountId: row.accountId ? String(row.accountId) : undefined,
    description: row.description || undefined,
    debitAmount: row.debit || undefined,
    creditAmount: row.credit || undefined,
    groupId: row.costCenterId ? String(row.costCenterId) : undefined,
  }
}

export function transformJournal(raw: AlegraJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.entries ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    description: journal.description,
    date: toCalendarDate(journal.postedAt),
    entries: journal.lineItems?.map((li) => ({
      accountId: li.accountId ? Number(li.accountId) : undefined,
      debit: li.debitAmount,
      credit: li.creditAmount,
      description: li.description,
      costCenterId: li.groupId ? Number(li.groupId) : undefined,
    })),
  }
}
