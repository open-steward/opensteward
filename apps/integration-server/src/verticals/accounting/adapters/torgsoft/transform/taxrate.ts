import type { TaxRate } from '../../../schema/taxrate'

export interface TorgsoftTaxRate {
  id: string
  name: string
  rate: number
  [key: string]: unknown
}

export function transformTaxRate(raw: TorgsoftTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: raw.rate,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
