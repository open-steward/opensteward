import type { TaxRate } from '../../../schema/taxrate'

export interface NiboTaxRate {
  taxRateId: number
  name: string
  description: string
  rate: number
  isActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: NiboTaxRate): TaxRate {
  return {
    id: String(raw.taxRateId),
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.rate,
    isActive: raw.isActive,
    metadata: raw as Record<string, unknown>,
  }
}
