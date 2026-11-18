import type { TaxRate } from '../../../schema/taxrate'

export interface ClearBooksTaxRate {
  tax_code_id: string | number
  name: string
  rate: number
  is_active: boolean
  [key: string]: unknown
}

// UK VAT rates: 20% (standard), 5% (reduced), 0% (zero-rated), exempt
export function transformTaxRate(raw: ClearBooksTaxRate): TaxRate {
  return {
    id: String(raw.tax_code_id),
    name: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.is_active ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
