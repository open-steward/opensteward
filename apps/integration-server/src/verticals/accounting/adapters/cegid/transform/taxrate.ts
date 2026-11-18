import type { TaxRate } from '../../../schema/taxrate'

export interface CegidTaxRate {
  id: string
  name: string
  description: string
  rate: number
  isActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: CegidTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.rate,
    isActive: raw.isActive,
    metadata: raw as Record<string, unknown>,
  }
}
