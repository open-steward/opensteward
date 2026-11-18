import type { TaxRate } from '../../../schema/taxrate'

export interface KashooTaxRate {
  id: string
  name: string
  percentage: number
  is_active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: KashooTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    rate: raw.percentage / 100,
    isActive: raw.is_active,
    metadata: raw as Record<string, unknown>,
  }
}
