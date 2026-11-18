import type { TaxRate } from '../../../schema/taxrate'

export interface BillingoTaxRate {
  id: string | number
  name?: string
  rate?: number
  type?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: BillingoTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: raw.rate,
    metadata: raw as Record<string, unknown>,
  }
}
