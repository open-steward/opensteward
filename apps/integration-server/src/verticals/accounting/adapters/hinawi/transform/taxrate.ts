import type { TaxRate } from '../../../schema/taxrate'

export interface HinawiTaxRate {
  id: string | number
  Name: string
  Rate: number
  IsActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: HinawiTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.Name || undefined,
    rate: raw.Rate,
    isActive: raw.IsActive,
    metadata: raw as Record<string, unknown>,
  }
}
