/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface InsertnexoTaxRate {
  Id: string | number
  Nazwa?: string
  Stawka?: number
  Aktywna?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: InsertnexoTaxRate): TaxRate {
  return {
    id: String(raw.Id),
    name: raw.Nazwa || undefined,
    rate: raw.Stawka,
    isActive: raw.Aktywna,
    metadata: raw as Record<string, unknown>,
  }
}
