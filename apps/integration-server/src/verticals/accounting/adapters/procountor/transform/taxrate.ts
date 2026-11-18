import type { TaxRate } from '../../../schema/taxrate'

export interface ProcountorTaxRate {
  id: number
  name: string
  description: string
  percentage: number
  active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: ProcountorTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.percentage / 100,
    isActive: raw.active,
    metadata: raw as Record<string, unknown>,
  }
}
