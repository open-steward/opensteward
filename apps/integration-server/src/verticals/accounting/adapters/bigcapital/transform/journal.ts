import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

/**
 * Convert a Bigcapital float major-unit amount to integer minor units (cents).
 * Returns undefined when the value is not a finite number.
 */
function toMinor(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !isFinite(value)) return undefined
  return Math.round(value * 100)
}

export interface BigcapitalManualJournalEntry {
  index: number
  accountId: number
  debit?: number
  credit?: number
  note?: string
  contactId?: number
  projectId?: number
  branchId?: number
  [key: string]: unknown
}

export interface BigcapitalManualJournal {
  id: number
  journalNumber?: string
  date: string
  journalType?: string
  reference?: string
  description?: string
  currencyCode?: string
  amount?: number
  isPublished?: boolean
  publishedAt?: string
  entries: BigcapitalManualJournalEntry[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapEntry(entry: BigcapitalManualJournalEntry): JournalLineitem {
  return {
    accountId: entry.accountId != null ? String(entry.accountId) : undefined,
    description: entry.note || undefined,
    debitAmount: toMinor(entry.debit),
    creditAmount: toMinor(entry.credit),
    contactId: entry.contactId != null ? String(entry.contactId) : undefined,
    projectId: entry.projectId != null ? String(entry.projectId) : undefined,
  }
}

export function transformJournal(raw: BigcapitalManualJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || raw.journalNumber || undefined,
    lineItems: (raw.entries ?? []).map(mapEntry),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// Canonical Journal → Bigcapital request body (for create/update)
// Canonical amounts are integer minor units; Bigcapital expects major-unit floats.
export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    description: journal.description,
    date: toCalendarDate(journal.postedAt),
    entries: journal.lineItems?.map((li, idx) => ({
      index: idx + 1,
      accountId: li.accountId != null ? Number(li.accountId) : undefined,
      debit: li.debitAmount != null ? li.debitAmount / 100 : undefined,
      credit: li.creditAmount != null ? li.creditAmount / 100 : undefined,
      note: li.description,
      contactId: li.contactId != null ? Number(li.contactId) : undefined,
      projectId: li.projectId != null ? Number(li.projectId) : undefined,
    })),
  }
}
