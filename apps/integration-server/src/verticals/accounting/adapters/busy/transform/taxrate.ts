import type { TaxRate } from '../../../schema/taxrate'

export interface BusyTaxRate {
  Code: string
  Name: string
  Rate: number
  IsActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: BusyTaxRate): TaxRate {
  return {
    id: String(raw.Code),
    name: raw.Name || undefined,
    rate: raw.Rate,
    isActive: Boolean(raw.IsActive),
    metadata: raw as Record<string, unknown>,
  }
}
