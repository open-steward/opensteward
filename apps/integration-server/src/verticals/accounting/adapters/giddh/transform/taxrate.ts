import type { TaxRate } from '../../../schema/taxrate'

export interface GiddhTax {
  uniqueName: string
  name: string
  taxType: string
  taxAmount: number
  isActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: GiddhTax): TaxRate {
  return {
    id: raw.uniqueName,
    name: raw.name || undefined,
    description: raw.taxType || undefined,
    rate: raw.taxAmount,
    isActive: raw.isActive,
    metadata: raw as Record<string, unknown>,
  }
}
