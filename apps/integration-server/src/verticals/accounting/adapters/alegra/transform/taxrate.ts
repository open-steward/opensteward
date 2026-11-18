import type { TaxRate } from '../../../schema/taxrate'

export interface AlegraTaxRate {
  id: number
  name: string
  description: string
  percentage: number
  status: string
  [key: string]: unknown
}

export function transformTaxRate(raw: AlegraTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.percentage,
    isActive: raw.status !== 'inactive',
    metadata: raw as Record<string, unknown>,
  }
}
