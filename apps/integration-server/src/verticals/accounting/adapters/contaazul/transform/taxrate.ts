import type { TaxRate } from '../../../schema/taxrate'

export interface ContaAzulTaxRate {
  id: string
  name: string
  description: string
  rate: number
  active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: ContaAzulTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.rate,
    isActive: raw.active,
    metadata: raw as Record<string, unknown>,
  }
}
