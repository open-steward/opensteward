import type { TaxRate } from '../../../schema/taxrate'

export interface AcconomyTaxRate {
  id: number | string
  name?: string
  rate?: number
  is_active?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: AcconomyTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.is_active ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
