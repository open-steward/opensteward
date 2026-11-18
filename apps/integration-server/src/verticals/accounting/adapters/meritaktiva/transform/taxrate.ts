import type { TaxRate } from '../../../schema/taxrate'

export interface MeritaktivaTaxRate {
  id: string | number
  name?: string
  rate?: number
  type?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: MeritaktivaTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: raw.rate,
    metadata: raw as Record<string, unknown>,
  }
}
