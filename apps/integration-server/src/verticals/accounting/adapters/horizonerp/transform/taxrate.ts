import type { TaxRate } from '../../../schema/taxrate'

export interface HorizonErpTaxRate {
  id: string
  name: string
  percentage: number
  type: string
  active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: HorizonErpTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.type || undefined,
    rate: raw.percentage,
    isActive: Boolean(raw.active),
    metadata: raw as Record<string, unknown>,
  }
}
