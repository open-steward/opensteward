/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface Sage50DeTaxRate {
  id: string
  displayed_as?: string
  percentage?: number
  is_active?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: Sage50DeTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.displayed_as,
    rate: raw.percentage,
    isActive: raw.is_active,
    metadata: raw as Record<string, unknown>,
  }
}
