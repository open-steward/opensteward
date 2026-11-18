import type { TaxRate } from '../../../schema/taxrate'

export interface NetvisorTaxRate {
  NetvisorKey: number
  Name: string
  Percentage: number
  IsActive: number
  [key: string]: unknown
}

export function transformTaxRate(raw: NetvisorTaxRate): TaxRate {
  return {
    id: String(raw.NetvisorKey),
    name: raw.Name || undefined,
    rate: raw.Percentage / 100,
    isActive: raw.IsActive === 1,
    metadata: raw as Record<string, unknown>,
  }
}
