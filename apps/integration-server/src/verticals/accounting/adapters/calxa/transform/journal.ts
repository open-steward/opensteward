import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

/**
 * Calxa journal line item as returned within a journal entry.
 */
export interface CalxaJournalLine {
  id?: string
  /** Account identifier for this line. */
  accountId?: string
  /** Descriptive note for this line. */
  description?: string
  /** Debit amount (mutually exclusive with credit). */
  debitAmount?: number
  /** Credit amount (mutually exclusive with debit). */
  creditAmount?: number
  [key: string]: unknown
}

/**
 * Calxa journal entry as returned by GET /journals and GET /journals/:id.
 *
 * Journal entries represent the underlying double-entry accounting transactions
 * synced from the connected accounting system.
 */
export interface CalxaJournal {
  id: string
  /** Human-readable journal / voucher number. */
  journalNumber?: string
  /** Description / narration for the journal. */
  description?: string
  /** External reference (e.g. source invoice number). */
  reference?: string
  /** Source system name or document type. */
  source?: string
  /** ISO 4217 currency for the journal. */
  currency?: string
  lines?: CalxaJournalLine[]
  /** ISO 8601 date the journal was posted. */
  date?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapJournalLine(line: CalxaJournalLine): JournalLineitem {
  return {
    id: line.id || undefined,
    accountId: line.accountId || undefined,
    description: line.description || undefined,
    debitAmount: line.debitAmount ?? undefined,
    creditAmount: line.creditAmount ?? undefined,
  }
}

export function transformJournal(raw: CalxaJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    reference: raw.reference || raw.journalNumber || undefined,
    source: raw.source || undefined,
    currency: raw.currency || undefined,
    lineItems: (raw.lines ?? []).map(mapJournalLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
