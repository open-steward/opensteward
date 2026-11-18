import type { TaxRate } from '../../../schema/taxrate'

export interface BlacklineTaxRate {
  taxRateId: string
  name: string
  rate: number
  isActive: boolean
  createdAt: string
  modifiedAt: string
  [key: string]: unknown
}

export function transformTaxRate(raw: BlacklineTaxRate): TaxRate {
  return {
    id: String(raw.taxRateId),
    name: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.isActive ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
