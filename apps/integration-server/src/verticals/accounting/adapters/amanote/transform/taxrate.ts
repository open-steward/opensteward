import type { TaxRate } from '../../../schema/taxrate'

export interface AmanoteTaxRate {
  id: string | number
  name?: string
  rate?: number
  is_active?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: AmanoteTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name,
    rate: raw.rate,
    isActive: raw.is_active,
    metadata: raw as Record<string, unknown>,
  }
}
