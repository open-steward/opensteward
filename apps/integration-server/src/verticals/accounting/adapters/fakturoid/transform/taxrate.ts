import type { TaxRate } from '../../../schema/taxrate'

export interface FakturoidTaxRate {
  id: number
  name: string
  vat_rate: number
  is_active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: FakturoidTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: raw.vat_rate / 100,
    isActive: raw.is_active,
    metadata: raw as Record<string, unknown>,
  }
}
