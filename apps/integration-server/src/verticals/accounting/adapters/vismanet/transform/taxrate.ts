import type { TaxRate } from '../../../schema/taxrate'

export interface VismaNetTaxRate {
  id: string
  name?: string
  rate?: number
  isActive?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: VismaNetTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.isActive ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
