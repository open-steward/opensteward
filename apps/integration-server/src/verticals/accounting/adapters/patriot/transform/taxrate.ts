import type { TaxRate } from '../../../schema/taxrate'

export interface PatriotTaxRate {
  id: string
  name: string
  description: string
  rate: number
  is_active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: PatriotTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.rate / 100,
    isActive: raw.is_active,
    metadata: raw as Record<string, unknown>,
  }
}
