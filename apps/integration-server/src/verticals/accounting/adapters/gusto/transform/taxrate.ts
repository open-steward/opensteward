import type { TaxRate } from '../../../schema/taxrate'

export interface GustoTaxRate {
  id: string | number
  name: string
  rate: number | string
  is_active?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: GustoTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: typeof raw.rate === 'string' ? parseFloat(raw.rate) : raw.rate,
    isActive: raw.is_active ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
