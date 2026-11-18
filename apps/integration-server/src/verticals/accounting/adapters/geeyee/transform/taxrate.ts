import type { TaxRate } from '../../../schema/taxrate'

export interface GeeyeeTaxRate {
  id?: string
  name?: string
  rate?: number
  isActive?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: GeeyeeTaxRate): TaxRate {
  return {
    id: raw.id ? String(raw.id) : '',
    name: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.isActive,
    metadata: raw as Record<string, unknown>,
  }
}
