import type { TaxRate } from '../../../schema/taxrate'

/**
 * Calxa tax rate as returned by GET /tax-rates and GET /tax-rates/:id.
 *
 * Tax rates are synced from the connected accounting system and exposed
 * read-only via this resource.
 */
export interface CalxaTaxRate {
  id: string
  /** Short name / code for the tax rate (e.g. "GST10", "VAT20"). */
  name?: string
  /** Human-readable description. */
  description?: string
  /** Rate as a percentage (e.g. 10 for 10%). */
  rate?: number
  /** Whether the tax rate is currently active in the connected system. */
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: CalxaTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.rate ?? undefined,
    isActive: raw.isActive ?? undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
