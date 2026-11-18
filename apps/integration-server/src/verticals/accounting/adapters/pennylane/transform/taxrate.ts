import type { TaxRate } from '../../../schema/taxrate'

export interface PennylaneTaxRate {
  id: string
  label: string
  rate: number
  [key: string]: unknown
}

export function transformTaxRate(raw: PennylaneTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.label || undefined,
    rate: raw.rate,
    metadata: raw as Record<string, unknown>,
  }
}
