import type { TaxRate } from '../../../schema/taxrate'

export interface JalebiTaxRate {
  id: string | number
  name: string
  rate: number
  active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: JalebiTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.active,
    metadata: raw as Record<string, unknown>,
  }
}
