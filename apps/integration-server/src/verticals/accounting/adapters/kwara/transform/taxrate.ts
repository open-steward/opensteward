import type { TaxRate } from '../../../schema/taxrate'

export interface KwaraTaxRate {
  id: string
  name?: string
  rate?: number
  is_active?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: KwaraTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.is_active,
    metadata: raw as Record<string, unknown>,
  }
}
