import type { TaxRate } from '../../../schema/taxrate'

export interface WaveTaxRate {
  id: string
  name: string
  rate: number
  isActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: WaveTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    rate: raw.rate / 100,
    isActive: raw.isActive,
    metadata: raw as Record<string, unknown>,
  }
}
