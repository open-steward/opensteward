import type { TaxRate } from '../../../schema/taxrate'

export interface LexofficeTaxRate {
  id: string
  name: string
  taxRatePercentage: number
  [key: string]: unknown
}

export function transformTaxRate(raw: LexofficeTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    rate: raw.taxRatePercentage,
    metadata: raw as Record<string, unknown>,
  }
}
