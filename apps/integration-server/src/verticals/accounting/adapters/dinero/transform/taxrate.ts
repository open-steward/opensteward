import type { TaxRate } from '../../../schema/taxrate'

export interface DineroTaxRate {
  Id: string
  Name: string
  Description: string
  RatePercent: number
  IsActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: DineroTaxRate): TaxRate {
  return {
    id: raw.Id,
    name: raw.Name || undefined,
    description: raw.Description || undefined,
    rate: raw.RatePercent / 100,
    isActive: raw.IsActive,
    metadata: raw as Record<string, unknown>,
  }
}
