import type { TaxRate } from '../../../schema/taxrate'

export interface BillomatTaxRate {
  id: string
  name: string
  rate: number
  is_default: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: BillomatTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    rate: raw.rate / 100,
    isActive: raw.is_default !== undefined ? true : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
