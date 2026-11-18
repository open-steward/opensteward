import type { TaxRate } from '../../../schema/taxrate'

export interface AkauntingTaxRate {
  id: number
  name: string
  rate: number
  type: string
  enabled: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: AkauntingTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: raw.rate / 100,
    isActive: raw.enabled ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
