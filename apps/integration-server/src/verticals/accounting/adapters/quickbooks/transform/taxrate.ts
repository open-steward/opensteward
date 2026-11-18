import type { TaxRate } from '../../../schema/taxrate'

export interface QBOTaxRate {
  Id: string
  Name: string
  Description: string
  RateValue: number
  Active: boolean
  AgencyRef?: { value: string }
  TaxReturnLineRef?: { value: string }
  [key: string]: unknown
}

export function transformTaxRate(raw: QBOTaxRate): TaxRate {
  return {
    id: raw.Id,
    name: raw.Name || undefined,
    description: raw.Description || undefined,
    rate: raw.RateValue,
    isActive: raw.Active,
    metadata: raw as Record<string, unknown>,
  }
}
