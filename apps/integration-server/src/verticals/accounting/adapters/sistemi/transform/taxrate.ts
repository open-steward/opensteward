import type { TaxRate } from '../../../schema/taxrate'

export interface SistemiTaxRate {
  id: string
  code: string
  description: string
  percentage: number
  is_active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: SistemiTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    description: raw.description || undefined,
    rate: raw.percentage,
    isActive: raw.is_active,
    metadata: raw as Record<string, unknown>,
  }
}
