/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ComarchoptimaJournalLine {
  id?: string | number
  konto_id?: string
  opis?: string
  winien?: number
  ma?: number
  kwota_vat?: number
  [key: string]: unknown
}

export interface ComarchoptimaJournal {
  id: string | number
  data?: string
  opis?: string
  numer?: string
  waluta?: string
  pozycje?: ComarchoptimaJournalLine[]
  [key: string]: unknown
}

export function transformJournal(raw: ComarchoptimaJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.opis || undefined,
    reference: raw.numer || undefined,
    currency: raw.waluta || undefined,
    postedAt: raw.data ? new Date(raw.data) : undefined,
    lineItems: (raw.pozycje ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      accountId: l.konto_id ? String(l.konto_id) : undefined,
      description: l.opis || undefined,
      debitAmount: l.winien,
      creditAmount: l.ma,
      taxAmount: l.kwota_vat,
    } satisfies JournalLineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
