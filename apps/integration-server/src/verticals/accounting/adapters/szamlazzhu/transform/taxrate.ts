/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Primary API is XML-based; REST API availability unconfirmed.
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface SzamlazzhuTaxRate {
  id: string | number
  name?: string
  rate?: number
  type?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: SzamlazzhuTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: raw.rate,
    metadata: raw as Record<string, unknown>,
  }
}
