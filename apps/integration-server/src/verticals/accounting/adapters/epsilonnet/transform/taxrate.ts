import type { TaxRate } from '../../../schema/taxrate'

export interface EpsilonNetTaxRate {
  id: string | number
  name: string
  rate: number
  isActive: boolean
  [key: string]: unknown
}

// Greek VAT rates: 24% (standard), 13% (reduced), 6% (super-reduced), 0%
export function transformTaxRate(raw: EpsilonNetTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.isActive ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
