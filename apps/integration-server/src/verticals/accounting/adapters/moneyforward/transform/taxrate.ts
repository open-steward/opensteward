import type { TaxRate } from '../../../schema/taxrate'

// Money Forward does not have a dedicated tax rates endpoint.
// Japanese consumption tax rates are hardcoded: standard 10%, reduced 8%.

export interface MoneyForwardHardcodedTaxRate {
  id: string
  name: string
  rate: number
  [key: string]: unknown
}

export const MONEYFORWARD_HARDCODED_TAX_RATES: MoneyForwardHardcodedTaxRate[] = [
  { id: 'jp_standard_10', name: '消費税 (標準税率 10%)', rate: 10 },
  { id: 'jp_reduced_8', name: '消費税 (軽減税率 8%)', rate: 8 },
]

export function transformTaxRate(raw: MoneyForwardHardcodedTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.name,
    rate: raw.rate,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
