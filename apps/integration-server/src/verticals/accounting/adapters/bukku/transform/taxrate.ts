import type { TaxRate } from '../../../schema/taxrate'

export interface BukkuTaxRate {
  id: string | number
  name: string
  rate: number
  type: string
  is_active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: BukkuTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.is_active,
    metadata: raw as Record<string, unknown>,
  }
}
