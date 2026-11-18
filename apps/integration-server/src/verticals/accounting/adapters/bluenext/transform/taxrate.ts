import type { TaxRate } from '../../../schema/taxrate'

export interface BluenextTaxRate {
  id: string
  code: string
  description: string
  percentage: number
  isActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: BluenextTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    description: raw.description || undefined,
    rate: raw.percentage,
    isActive: raw.isActive,
    metadata: raw as Record<string, unknown>,
  }
}
