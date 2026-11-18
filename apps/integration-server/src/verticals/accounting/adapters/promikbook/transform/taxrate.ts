import type { TaxRate } from '../../../schema/taxrate'

export interface PromikBookTaxRate {
  id: number | string
  name?: string
  rate?: number
  active?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: PromikBookTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.active ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
