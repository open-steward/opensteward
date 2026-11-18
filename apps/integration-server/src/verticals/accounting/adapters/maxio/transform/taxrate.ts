import type { TaxRate } from '../../../schema/taxrate'

export interface MaxioTaxRate {
  id: number
  name: string
  percentage: string
  is_active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: MaxioTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: parseFloat(raw.percentage) || 0,
    isActive: raw.is_active ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
