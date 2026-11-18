import type { TaxRate } from '../../../schema/taxrate'

export interface RegateTaxRate {
  id: string
  name: string
  description: string
  rate: number
  is_active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: RegateTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.rate,
    isActive: raw.is_active,
    metadata: raw as Record<string, unknown>,
  }
}
