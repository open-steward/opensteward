import type { TaxRate } from '../../../schema/taxrate'

// Paraşüt uses vat_rate field on line items — Turkish VAT rates: 20%, 10%, 1%, 0%
export interface ParasutTaxRate {
  id: string
  name: string
  rate: number
  [key: string]: unknown
}

// Hardcoded Turkish VAT rates as returned by Paraşüt
const TURKISH_VAT_RATES: ParasutTaxRate[] = [
  { id: 'vat_20', name: 'KDV %20', rate: 20 },
  { id: 'vat_10', name: 'KDV %10', rate: 10 },
  { id: 'vat_1', name: 'KDV %1', rate: 1 },
  { id: 'vat_0', name: 'KDV %0', rate: 0 },
]

export function transformTaxRate(raw: ParasutTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name,
    rate: raw.rate,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}

export function getStaticTaxRates(): TaxRate[] {
  return TURKISH_VAT_RATES.map(transformTaxRate)
}
