import { toCalendarDate } from '../../shared/transform'
/**
 * Manager journal-entries → canonical Journal transform.
 *
 * API endpoint: GET /api2/journal-entries
 *               GET /api2/journal-entries/{key}
 *               POST /api2/journal-entry-form  (create)
 *
 * Manager amounts are plain floats in the document currency.
 * Canonical Amount is z.number().int() (minor units / cents), so all floats
 * must be multiplied by 100 and rounded before being stored.
 *
 * sortBy values: Date, Reference, Narration, Accounts, Project, Debit, Credit, Status
 */
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

/** Convert a Manager decimal float (e.g. 125.50) to integer minor units (12550). */
function toMinorUnits(value: number | null | undefined): number | undefined {
  if (value == null) return undefined
  return Math.round(value * 100)
}

/** Convert integer minor units back to the decimal float Manager expects on write. */
function fromMinorUnits(value: number | null | undefined): number | undefined {
  if (value == null) return undefined
  return value / 100
}

export interface ManagerJournalLine {
  account?: string
  debit?: { value?: number; currency?: string | null }
  credit?: { value?: number; currency?: string | null }
  description?: string
  [key: string]: unknown
}

export interface ManagerJournalEntry {
  key?: string
  date?: string
  reference?: string
  narration?: string
  lines?: ManagerJournalLine[]
  [key: string]: unknown
}

function mapLine(line: ManagerJournalLine): JournalLineitem {
  return {
    accountId: line.account || undefined,
    description: line.description || undefined,
    debitAmount: toMinorUnits(line.debit?.value),
    creditAmount: toMinorUnits(line.credit?.value),
  }
}

export function transformJournal(raw: ManagerJournalEntry): Journal {
  return {
    id: raw.key,
    description: raw.narration || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Journal → Manager journal-entry-form POST body */
export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    date: toCalendarDate(journal.postedAt),
    reference: journal.reference,
    narration: journal.description,
    lines: journal.lineItems?.map((li) => ({
      account: li.accountId,
      debit: li.debitAmount != null ? { value: fromMinorUnits(li.debitAmount) } : undefined,
      credit: li.creditAmount != null ? { value: fromMinorUnits(li.creditAmount) } : undefined,
      description: li.description,
    })),
  }
}
