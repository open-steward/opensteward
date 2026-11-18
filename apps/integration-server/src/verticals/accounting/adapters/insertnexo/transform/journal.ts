/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface InsertnexoJournalLine {
  Id?: string | number
  KontoId?: string
  Opis?: string
  Winien?: number
  Ma?: number
  KwotaVat?: number
  [key: string]: unknown
}

export interface InsertnexoJournal {
  Id: string | number
  Data?: string
  Opis?: string
  Numer?: string
  Waluta?: string
  Pozycje?: InsertnexoJournalLine[]
  [key: string]: unknown
}

export function transformJournal(raw: InsertnexoJournal): Journal {
  return {
    id: String(raw.Id),
    description: raw.Opis || undefined,
    reference: raw.Numer || undefined,
    currency: raw.Waluta || undefined,
    postedAt: raw.Data ? new Date(raw.Data) : undefined,
    lineItems: (raw.Pozycje ?? []).map(l => ({
      id: l.Id ? String(l.Id) : undefined,
      accountId: l.KontoId ? String(l.KontoId) : undefined,
      description: l.Opis || undefined,
      debitAmount: l.Winien,
      creditAmount: l.Ma,
      taxAmount: l.KwotaVat,
    } satisfies JournalLineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
