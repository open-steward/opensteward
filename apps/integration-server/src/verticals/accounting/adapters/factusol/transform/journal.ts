/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface FactusolJournalLine {
  cuenta: string
  descripcion: string
  debe: number
  haber: number
  [key: string]: unknown
}

export interface FactusolJournal {
  id: string
  numero: string
  descripcion: string
  fecha: string
  lineas: FactusolJournalLine[]
  [key: string]: unknown
}

function mapLine(line: FactusolJournalLine): JournalLineitem {
  return {
    accountId: line.cuenta || undefined,
    description: line.descripcion || undefined,
    debitAmount: line.debe || undefined,
    creditAmount: line.haber || undefined,
  }
}

export function transformJournal(raw: FactusolJournal): Journal {
  return {
    id: raw.id,
    description: raw.descripcion || undefined,
    reference: raw.numero || undefined,
    lineItems: (raw.lineas ?? []).map(mapLine),
    postedAt: raw.fecha ? new Date(raw.fecha) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
