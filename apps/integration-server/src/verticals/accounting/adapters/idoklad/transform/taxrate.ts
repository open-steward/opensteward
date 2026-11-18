import type { TaxRate } from '../../../schema/taxrate'

export interface IdokladTaxRate {
  Id: string | number
  Name?: string
  Rate?: number
  IsActive?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: IdokladTaxRate): TaxRate {
  return {
    id: String(raw.Id),
    name: raw.Name || undefined,
    rate: raw.Rate,
    isActive: raw.IsActive,
    metadata: raw as Record<string, unknown>,
  }
}
