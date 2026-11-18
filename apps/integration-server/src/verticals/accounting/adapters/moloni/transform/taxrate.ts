import type { TaxRate } from '../../../schema/taxrate'

export interface MoloniTaxRate {
  tax_id: number
  name: string
  value: number
  type: number
  [key: string]: unknown
}

export function transformTaxRate(raw: MoloniTaxRate): TaxRate {
  return {
    id: String(raw.tax_id),
    name: raw.name || undefined,
    rate: raw.value,
    metadata: raw as Record<string, unknown>,
  }
}
