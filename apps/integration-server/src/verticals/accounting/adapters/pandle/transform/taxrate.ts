import type { TaxRate } from '../../../schema/taxrate'

export interface PandleTaxRate {
  id: number
  name: string
  percentage: number
  description: string
  is_active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: PandleTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.percentage / 100,
    isActive: raw.is_active,
    metadata: raw as Record<string, unknown>,
  }
}
