import type { TaxRate } from '../../../schema/taxrate'

export interface DaftraTaxRate {
  id: string
  Name?: string
  Rate?: number
  IsActive?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: DaftraTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.Name || undefined,
    rate: raw.Rate,
    isActive: raw.IsActive,
    metadata: raw as Record<string, unknown>,
  }
}
