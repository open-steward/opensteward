import type { TaxRate } from '../../../schema/taxrate'

export interface SendRegningTaxRate {
  id: string
  name?: string
  rate?: number
  active?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: SendRegningTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.active ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
