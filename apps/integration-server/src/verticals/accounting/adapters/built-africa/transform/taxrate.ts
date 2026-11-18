import type { TaxRate } from '../../../schema/taxrate'

/**
 * Built Africa tax rate — a VAT/tax configuration record.
 * The Built API exposes these at GET /api/v3/taxes.
 */
export interface BuiltAfricaTaxRate {
  id: number
  name?: string
  description?: string
  rate?: number     // percentage, e.g. 12.5
  is_active?: boolean | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: BuiltAfricaTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    // Built returns the rate as a percentage (e.g. 12.5 for 12.5%)
    rate: typeof raw.rate === 'number' ? raw.rate : undefined,
    isActive:
      raw.is_active !== undefined
        ? raw.is_active === true || raw.is_active === 1
        : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
