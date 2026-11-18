import type { TaxRate } from '../../../schema/taxrate'

export interface ManagerioTaxRate {
  Key: string
  Code: string
  Name: string
  Rate: number
  Active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: ManagerioTaxRate): TaxRate {
  return {
    id: String(raw.Key),
    name: raw.Name || undefined,
    description: raw.Code || undefined,
    rate: raw.Rate,
    isActive: Boolean(raw.Active),
    metadata: raw as Record<string, unknown>,
  }
}
