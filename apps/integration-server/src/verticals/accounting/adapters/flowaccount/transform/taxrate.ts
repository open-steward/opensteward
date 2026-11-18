import type { TaxRate } from '../../../schema/taxrate'

export interface FlowAccountTaxRate {
  id: string | number
  name: string
  rate: number
  isActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: FlowAccountTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.isActive,
    metadata: raw as Record<string, unknown>,
  }
}
