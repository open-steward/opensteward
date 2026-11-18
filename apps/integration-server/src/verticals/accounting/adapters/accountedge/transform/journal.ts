/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface AccountEdgeJournalLine {
  id: string
  account_id: string
  description: string
  debit: number
  credit: number
  contact_id: string
  [key: string]: unknown
}

export interface AccountEdgeJournal {
  id: string
  date: string
  description: string
  reference: string
  currency: string
  lines: AccountEdgeJournalLine[]
  [key: string]: unknown
}

function mapLine(row: AccountEdgeJournalLine): JournalLineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    contactId: row.contact_id || undefined,
    description: row.description || undefined,
    debitAmount: row.debit || undefined,
    creditAmount: row.credit || undefined,
  }
}

export function transformJournal(raw: AccountEdgeJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
