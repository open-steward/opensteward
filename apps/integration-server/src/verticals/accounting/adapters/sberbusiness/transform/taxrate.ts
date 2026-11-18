import type { TaxRate } from '../../../schema/taxrate'

export interface SberbusinessTaxRate {
  id?: string
  name?: string
  rate?: number
  isActive?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: SberbusinessTaxRate): TaxRate {
  return {
    id: raw.id ? String(raw.id) : '',
    name: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.isActive,
    metadata: raw as Record<string, unknown>,
  }
}
