import type { TaxRate } from '../../../schema/taxrate'

export interface InvoiceqTaxRate {
  id: string
  name?: string
  percentage?: number
  is_active?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: InvoiceqTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: raw.percentage,
    isActive: raw.is_active,
    metadata: raw as Record<string, unknown>,
  }
}
