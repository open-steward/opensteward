import type { TaxRate } from '../../../schema/taxrate'

export interface PowerOfficeTaxCode {
  id: number
  code: string
  description: string
  vatRate: number
  isActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: PowerOfficeTaxCode): TaxRate {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    description: raw.description || undefined,
    rate: raw.vatRate,
    isActive: raw.isActive,
    metadata: raw as Record<string, unknown>,
  }
}
