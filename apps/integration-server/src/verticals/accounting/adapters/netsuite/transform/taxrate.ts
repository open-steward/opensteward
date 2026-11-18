import type { TaxRate } from '../../../schema/taxrate'

export interface NetSuiteTaxCode {
  id?: string | number
  itemId?: string
  rate?: number
  description?: string
  isInactive?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: NetSuiteTaxCode): TaxRate {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.itemId || undefined,
    description: raw.description || undefined,
    rate: raw.rate,
    isActive: raw.isInactive !== true,
    metadata: raw as Record<string, unknown>,
  }
}
