import type { TaxRate } from '../../../schema/taxrate'

export interface EvolizTaxRate {
  id: string
  label: string
  description: string
  rate: number
  active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: EvolizTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.label || undefined,
    description: raw.description || undefined,
    rate: raw.rate,
    isActive: raw.active,
    metadata: raw as Record<string, unknown>,
  }
}
