/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Platform deprecated (Debitoor shut down).
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface DebitoorJournalLine {
  accountId: string
  description: string
  debitAmount: number
  creditAmount: number
  [key: string]: unknown
}

export interface DebitoorJournal {
  id: string
  reference: string
  description: string
  date: string
  lines: DebitoorJournalLine[]
  [key: string]: unknown
}

function mapLine(line: DebitoorJournalLine): JournalLineitem {
  return {
    accountId: line.accountId || undefined,
    description: line.description || undefined,
    debitAmount: line.debitAmount || undefined,
    creditAmount: line.creditAmount || undefined,
  }
}

export function transformJournal(raw: DebitoorJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
