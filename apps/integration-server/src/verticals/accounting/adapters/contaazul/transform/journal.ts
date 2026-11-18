import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ContaAzulJournalEntry {
  account_id: string
  description: string
  debit: number
  credit: number
  cost_center_id: string
  project_id: string
  [key: string]: unknown
}

export interface ContaAzulJournal {
  id: string
  description: string
  reference: string
  date: string
  entries: ContaAzulJournalEntry[]
  [key: string]: unknown
}

function mapLineitem(row: ContaAzulJournalEntry): JournalLineitem {
  return {
    accountId: row.account_id || undefined,
    description: row.description || undefined,
    debitAmount: row.debit || undefined,
    creditAmount: row.credit || undefined,
    groupId: row.cost_center_id || undefined,
    projectId: row.project_id || undefined,
  }
}

export function transformJournal(raw: ContaAzulJournal): Journal {
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
      account_id: li.accountId,
      debit: li.debitAmount,
      credit: li.creditAmount,
      description: li.description,
      cost_center_id: li.groupId,
      project_id: li.projectId,
    })),
  }
}
