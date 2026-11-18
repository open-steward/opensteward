import type { TaxRate } from '../../../schema/taxrate'

export interface MasteraccountingTaxRate {
  id: string
  name: string
  rate: number
  isActive?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: MasteraccountingTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.isActive ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
