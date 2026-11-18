/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface TallyTaxRate {
  NAME: string
  TAXTYPE: string
  PERCENTAGE: string
  [key: string]: unknown
}

export function transformTaxRate(raw: TallyTaxRate): TaxRate {
  const rate = parseFloat(raw.PERCENTAGE) / 100

  return {
    id: raw.NAME,
    name: raw.NAME,
    description: raw.TAXTYPE || undefined,
    rate: isNaN(rate) ? undefined : rate,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
