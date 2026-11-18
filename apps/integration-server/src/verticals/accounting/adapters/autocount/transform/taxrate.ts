import type { TaxRate } from '../../../schema/taxrate'

export interface AutocountTaxCode {
  TaxCode: string
  Description: string
  TaxRate: number
  TaxType: string
  [key: string]: unknown
}

export function transformTaxRate(raw: AutocountTaxCode): TaxRate {
  return {
    id: raw.TaxCode,
    name: raw.TaxCode,
    description: raw.Description || undefined,
    rate: raw.TaxRate,
    metadata: raw as Record<string, unknown>,
  }
}
