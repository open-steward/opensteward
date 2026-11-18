import type { TaxRate } from '../../../schema/taxrate'

export interface XledgerTaxRate {
  id: string
  code?: string
  description?: string
  rate?: number
  active?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: XledgerTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.description || undefined,
    description: raw.description || undefined,
    rate: raw.rate,
    isActive: raw.active ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
