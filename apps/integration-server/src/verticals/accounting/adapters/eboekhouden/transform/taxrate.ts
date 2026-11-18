import type { TaxRate } from '../../../schema/taxrate'

export interface EBoekhoudenTaxRate {
  code?: string
  description?: string
  percentage?: number
  isActive?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: EBoekhoudenTaxRate): TaxRate {
  return {
    id: raw.code || undefined,
    name: raw.description || raw.code || undefined,
    description: raw.description || undefined,
    rate: raw.percentage,
    isActive: raw.isActive ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
