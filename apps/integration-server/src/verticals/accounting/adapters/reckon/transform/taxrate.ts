import type { TaxRate } from '../../../schema/taxrate'

export interface ReckonTaxCode {
  id: string
  name: string
  rate: number
  type: string
  isActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: ReckonTaxCode): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.type || undefined,
    rate: raw.rate,
    isActive: raw.isActive,
    metadata: raw as Record<string, unknown>,
  }
}
