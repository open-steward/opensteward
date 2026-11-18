/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface ComarchoptimaTaxRate {
  id: string | number
  nazwa?: string
  stawka?: number
  aktywna?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: ComarchoptimaTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.nazwa || undefined,
    rate: raw.stawka,
    isActive: raw.aktywna,
    metadata: raw as Record<string, unknown>,
  }
}
