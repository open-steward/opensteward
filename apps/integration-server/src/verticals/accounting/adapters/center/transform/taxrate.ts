import type { TaxRate } from '../../../schema/taxrate'

export interface CenterTaxRate {
  id: string
  name: string
  percentage: number
  isActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: CenterTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    rate: raw.percentage / 100,
    isActive: raw.isActive,
    metadata: raw as Record<string, unknown>,
  }
}
