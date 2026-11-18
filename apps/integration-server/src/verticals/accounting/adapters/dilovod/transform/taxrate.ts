import type { TaxRate } from '../../../schema/taxrate'

export interface DilovodTaxRate {
  id: string
  name: string
  rate: number
  type?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: DilovodTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.type || undefined,
    rate: raw.rate,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
