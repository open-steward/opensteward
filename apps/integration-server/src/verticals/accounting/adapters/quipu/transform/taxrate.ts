import type { TaxRate } from '../../../schema/taxrate'

export interface QuipuTaxRate {
  id: string
  name: string
  description: string
  rate: number
  active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: QuipuTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.rate,
    isActive: raw.active,
    metadata: raw as Record<string, unknown>,
  }
}
