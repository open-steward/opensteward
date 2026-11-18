import type { TaxRate } from '../../../schema/taxrate'

export interface ProsvasisTaxRate {
  id: string | number
  Name: string
  Rate: number
  IsActive: boolean
  [key: string]: unknown
}

// Greek VAT rates: 24% (standard), 13% (reduced), 6% (super-reduced), 0%
export function transformTaxRate(raw: ProsvasisTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.Name || undefined,
    rate: raw.Rate,
    isActive: raw.IsActive ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
