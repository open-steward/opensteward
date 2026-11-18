/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Platform deprecated (Debitoor shut down).
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface DebitoorTaxRate {
  id: string
  name: string
  description: string
  percentage: number
  isActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: DebitoorTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.percentage,
    isActive: raw.isActive,
    metadata: raw as Record<string, unknown>,
  }
}
