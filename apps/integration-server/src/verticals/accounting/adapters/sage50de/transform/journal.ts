/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface Sage50DeJournalLine {
  ledger_account?: { id?: string; displayed_as?: string }
  debit?: number
  credit?: number
  description?: string
  [key: string]: unknown
}

export interface Sage50DeJournal {
  id: string
  date?: string
  description?: string
  reference?: string
  journal_lines?: Sage50DeJournalLine[]
  [key: string]: unknown
}

export function transformJournal(raw: Sage50DeJournal): Journal {
  const lineItems: JournalLineitem[] = (raw.journal_lines ?? []).map((line) => ({
    accountId: line.ledger_account?.id,
    description: line.description,
    debit: line.debit,
    credit: line.credit,
    metadata: line as Record<string, unknown>,
  }))

  return {
    id: String(raw.id),
    description: raw.description,
    reference: raw.reference,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
