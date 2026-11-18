import type { TaxRate } from '../../../schema/taxrate'

export interface WafeqTaxRate {
  id: string
  name?: string
  rate?: number
  is_active?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: WafeqTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.is_active,
    metadata: raw as Record<string, unknown>,
  }
}
