import type { TaxRate } from '../../../schema/taxrate'

export interface FacturamaTaxRate {
  Id: string
  Name: string
  Description: string
  Rate: number
  IsActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: FacturamaTaxRate): TaxRate {
  return {
    id: String(raw.Id),
    name: raw.Name || undefined,
    description: raw.Description || undefined,
    rate: raw.Rate,
    isActive: raw.IsActive,
    metadata: raw as Record<string, unknown>,
  }
}
