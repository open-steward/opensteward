import type { TaxRate } from '../../../schema/taxrate'

export interface CmicTaxRate {
  TaxRateId: string
  Name: string
  Rate: number
  IsActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: CmicTaxRate): TaxRate {
  return {
    id: String(raw.TaxRateId),
    name: raw.Name || undefined,
    rate: raw.Rate,
    isActive: raw.IsActive ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
