import type { TaxRate } from '../../../schema/taxrate'

export interface PeakAccountTaxRate {
  id: string | number
  name: string
  rate: number
  isActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: PeakAccountTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.isActive,
    metadata: raw as Record<string, unknown>,
  }
}
