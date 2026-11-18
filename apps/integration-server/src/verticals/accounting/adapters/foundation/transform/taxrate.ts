/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface FoundationTaxRate {
  TaxRateId: string | number
  TaxRateName: string
  Rate: number
  IsActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: FoundationTaxRate): TaxRate {
  return {
    id: String(raw.TaxRateId),
    name: raw.TaxRateName || undefined,
    rate: raw.Rate,
    isActive: raw.IsActive ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
