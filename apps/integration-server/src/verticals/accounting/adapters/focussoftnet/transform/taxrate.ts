import type { TaxRate } from '../../../schema/taxrate'

export interface FocusSoftnetTaxRate {
  Code: string
  Description: string
  Rate: number
  Active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: FocusSoftnetTaxRate): TaxRate {
  return {
    id: String(raw.Code),
    name: raw.Description || undefined,
    description: raw.Description || undefined,
    rate: raw.Rate,
    isActive: Boolean(raw.Active),
    metadata: raw as Record<string, unknown>,
  }
}
