import type { TaxRate } from '../../../schema/taxrate'
import { parseDecimal } from '../../shared/transform'

// DualEntry exposes VAT rates at GET /public/v2/vat-rates/
export interface DualentryVatRate {
  id: number
  country_code: string | null
  name: string
  rate: string
  rate_type: string | null
  tax_type: string | null
  valid_from: string | null
  valid_to: string | null
  is_active: boolean
  is_system: boolean
  description: string | null
  [key: string]: unknown
}

export function transformTaxRate(raw: DualentryVatRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: parseDecimal(raw.rate),
    isActive: raw.is_active,
    metadata: raw as Record<string, unknown>,
  }
}
