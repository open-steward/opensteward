import type { TaxRate } from '../../../schema/taxrate'

export interface ICountTaxRate {
  id: string
  name: string
  rate: number
  isActive?: boolean
  [key: string]: unknown
}

// Israeli VAT: 17% standard, 0% exempt
export const ICOUNT_TAX_RATES: ICountTaxRate[] = [
  { id: 'vat_17', name: 'VAT 17%', rate: 17, isActive: true },
  { id: 'vat_0', name: 'VAT Exempt 0%', rate: 0, isActive: true },
]

export function transformTaxRate(raw: ICountTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.isActive ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
