import type { TaxRate } from '../../../schema/taxrate'

export interface TwentyFourSevenTaxRate {
  id: string
  name: string
  description: string
  percentage: number
  isActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: TwentyFourSevenTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.percentage / 100,
    isActive: raw.isActive,
    metadata: raw as Record<string, unknown>,
  }
}
