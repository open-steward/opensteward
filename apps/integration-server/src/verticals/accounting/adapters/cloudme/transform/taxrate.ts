import type { TaxRate } from '../../../schema/taxrate'

export interface CloudMeTaxRate {
  id: string | number
  name: string
  rate: number
  is_active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: CloudMeTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.is_active,
    metadata: raw as Record<string, unknown>,
  }
}
