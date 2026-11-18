/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface DatevJournalLine {
  id: string | number
  account_number: string
  description: string
  debit_amount: number
  credit_amount: number
  [key: string]: unknown
}

export interface DatevJournal {
  id: string | number
  document_number: string
  booking_date: string
  description: string
  journal_lines: DatevJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: DatevJournalLine): JournalLineitem {
  return {
    id: String(line.id),
    description: line.description || undefined,
    debitAmount: line.debit_amount || undefined,
    creditAmount: line.credit_amount || undefined,
  }
}

export function transformJournal(raw: DatevJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.document_number || undefined,
    lineItems: (raw.journal_lines ?? []).map(mapJournalLine),
    postedAt: raw.booking_date ? new Date(raw.booking_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
