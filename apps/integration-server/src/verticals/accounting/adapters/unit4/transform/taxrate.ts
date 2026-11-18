/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface Unit4TaxRate {
  taxRateId: string | number
  name: string
  rate: number
  isActive?: boolean
  companyId?: string | number
  [key: string]: unknown
}

export function transformTaxRate(raw: Unit4TaxRate): TaxRate {
  return {
    id: String(raw.taxRateId),
    name: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.isActive ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
