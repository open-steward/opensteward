/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface AccountEdgeTaxRate {
  id: string
  name: string
  rate: number
  is_active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: AccountEdgeTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    rate: raw.rate / 100,
    isActive: raw.is_active,
    metadata: raw as Record<string, unknown>,
  }
}
