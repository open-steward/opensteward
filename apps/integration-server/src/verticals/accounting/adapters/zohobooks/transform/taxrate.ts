import type { TaxRate } from '../../../schema/taxrate'

export interface ZohoBooksTaxRate {
  tax_id: string
  tax_name: string
  tax_percentage: number
  is_default: boolean
  is_inactive: boolean
  tax_type: string
  [key: string]: unknown
}

export function transformTaxRate(raw: ZohoBooksTaxRate): TaxRate {
  return {
    id: raw.tax_id,
    name: raw.tax_name || undefined,
    rate: raw.tax_percentage,
    isActive: !raw.is_inactive,
    metadata: raw as Record<string, unknown>,
  }
}
