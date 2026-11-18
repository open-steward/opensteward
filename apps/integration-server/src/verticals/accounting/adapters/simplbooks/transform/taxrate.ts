import type { TaxRate } from '../../../schema/taxrate'

// SimplBooks VAT / tax rate record
export interface SimplbooksTaxRate {
  id: number
  name?: string | null
  // Percentage stored as a decimal, e.g. 20 for 20% VAT
  rate?: number | null
  is_active?: boolean | null
  [key: string]: unknown
}

export function transformTaxRate(raw: SimplbooksTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: raw.rate ?? undefined,
    isActive: raw.is_active ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
