import type { TaxRate } from '../../../schema/taxrate'

export interface MorningTaxRate {
  id: string
  name: string
  rate: number
  isActive?: boolean
  [key: string]: unknown
}

// Israeli VAT is typically 17% (standard) and 0% (exempt)
export const MORNING_TAX_RATES: MorningTaxRate[] = [
  { id: 'vat_17', name: 'VAT 17%', rate: 17, isActive: true },
  { id: 'vat_0', name: 'VAT Exempt 0%', rate: 0, isActive: true },
]

export function transformTaxRate(raw: MorningTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.isActive ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
