import type { TaxRate } from '../../../schema/taxrate'

export interface MisaAmisTaxRate {
  id: string
  tax_name: string
  tax_rate: number
  tax_code: string
  is_active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: MisaAmisTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.tax_name || undefined,
    description: raw.tax_code || undefined,
    rate: raw.tax_rate,
    isActive: raw.is_active,
    metadata: raw as Record<string, unknown>,
  }
}
