/**
 * Manager tax-codes → canonical TaxRate transform.
 *
 * API endpoint: GET /api2/tax-codes
 */
import type { TaxRate } from '../../../schema/taxrate'

export interface ManagerTaxCode {
  key?: string
  name?: string
  taxRate?: number
  /** Manager does not expose an active/inactive flag for tax codes directly */
  [key: string]: unknown
}

export function transformTaxRate(raw: ManagerTaxCode): TaxRate {
  return {
    id: raw.key,
    name: raw.name || undefined,
    description: raw.name || undefined,
    rate: raw.taxRate,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
