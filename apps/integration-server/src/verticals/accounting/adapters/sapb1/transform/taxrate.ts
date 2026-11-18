/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface SapB1TaxCode {
  Code: string
  Name: string
  Rate: number
  Active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: SapB1TaxCode): TaxRate {
  return {
    id: raw.Code,
    name: raw.Name,
    description: raw.Name,
    rate: raw.Rate / 100,
    isActive: raw.Active,
    metadata: raw as Record<string, unknown>,
  }
}
