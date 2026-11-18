import type { TaxRate } from '../../../schema/taxrate'

export interface SageTaxRate {
  id: string
  name?: string
  percentage?: number
  is_visible?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: SageTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    rate: raw.percentage,
    isActive: raw.is_visible !== false,
    metadata: raw as Record<string, unknown>,
  }
}
