import type { TaxRate } from '../../../schema/taxrate'

export interface CloudFinanceTaxRate {
  id: string
  code: string
  name: string
  percentage: number
  active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: CloudFinanceTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.name || undefined,
    rate: raw.percentage,
    isActive: raw.active,
    metadata: raw as Record<string, unknown>,
  }
}
