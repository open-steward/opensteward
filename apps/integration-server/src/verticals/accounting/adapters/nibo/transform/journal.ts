import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface NiboJournalLine {
  accountId: number
  debitValue: number
  creditValue: number
  description: string
  costCenterId: string
  projectId: string
  [key: string]: unknown
}

export interface NiboJournal {
  journalId: number
  description: string
  postDate: string
  reference: string
  lines: NiboJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(row: NiboJournalLine): JournalLineitem {
  return {
    accountId: row.accountId ? String(row.accountId) : undefined,
    description: row.description || undefined,
    debitAmount: row.debitValue || undefined,
    creditAmount: row.creditValue || undefined,
    groupId: row.costCenterId || undefined,
    projectId: row.projectId || undefined,
  }
}

export function transformJournal(raw: NiboJournal): Journal {
  return {
    id: String(raw.journalId),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapJournalLine),
    postedAt: raw.postDate ? new Date(raw.postDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    description: journal.description,
    postDate: toCalendarDate(journal.postedAt),
    lines: journal.lineItems?.map((li) => ({
      accountId: li.accountId ? Number(li.accountId) : undefined,
      debitValue: li.debitAmount,
      creditValue: li.creditAmount,
      description: li.description,
      costCenterId: li.groupId,
      projectId: li.projectId,
    })),
  }
}
