/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface DaneaRigaRegistrazione {
  Conto: string
  Descrizione: string
  Dare: number
  Avere: number
  [key: string]: unknown
}

export interface DaneaRegistrazione {
  id: string
  Numero: string
  Descrizione: string
  Data: string
  Righe?: DaneaRigaRegistrazione[]
  [key: string]: unknown
}

function mapLineitem(row: DaneaRigaRegistrazione): JournalLineitem {
  return {
    accountId: row.Conto || undefined,
    description: row.Descrizione || undefined,
    debitAmount: row.Dare || undefined,
    creditAmount: row.Avere || undefined,
  }
}

export function transformJournal(raw: DaneaRegistrazione): Journal {
  return {
    id: String(raw.id),
    description: raw.Descrizione || undefined,
    reference: raw.Numero || undefined,
    lineItems: (raw.Righe ?? []).map(mapLineitem),
    postedAt: raw.Data ? new Date(raw.Data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
