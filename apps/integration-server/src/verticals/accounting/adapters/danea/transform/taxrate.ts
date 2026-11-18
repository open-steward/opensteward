/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface DaneaAliquotaIva {
  id: string
  Codice: string
  Descrizione: string
  Percentuale: number
  Attivo: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: DaneaAliquotaIva): TaxRate {
  return {
    id: String(raw.id),
    name: raw.Descrizione || undefined,
    description: raw.Descrizione || undefined,
    rate: raw.Percentuale,
    isActive: raw.Attivo,
    metadata: raw as Record<string, unknown>,
  }
}
