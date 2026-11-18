/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface PohodaJournalLine {
  id?: string | number
  accountId?: string
  description?: string
  debit?: number
  credit?: number
  amount?: number
  [key: string]: unknown
}

export interface PohodaJournal {
  id: string | number
  date?: string
  description?: string
  reference?: string
  currency?: string
  items?: PohodaJournalLine[]
  [key: string]: unknown
}

export function transformJournal(raw: PohodaJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: (raw.items ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      accountId: l.accountId ? String(l.accountId) : undefined,
      description: l.description || undefined,
      debitAmount: l.debit,
      creditAmount: l.credit,
      totalAmount: l.amount,
    } satisfies JournalLineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
