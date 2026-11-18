import type { TaxRate } from '../../../schema/taxrate'

export interface BlTaxRate {
  Id: string
  Name: string
  Description: string
  Rate: number
  IsActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: BlTaxRate): TaxRate {
  return {
    id: raw.Id,
    name: raw.Name || undefined,
    description: raw.Description || undefined,
    rate: raw.Rate / 100,
    isActive: raw.IsActive,
    metadata: raw as Record<string, unknown>,
  }
}
