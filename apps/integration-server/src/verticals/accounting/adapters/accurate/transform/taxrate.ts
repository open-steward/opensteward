import type { TaxRate } from '../../../schema/taxrate'
import { parseDecimal } from '../../shared/transform'

export interface AccurateTaxRate {
  id: number
  name: string
  rate: number
  isActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: AccurateTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: parseDecimal(raw.rate),
    isActive: raw.isActive,
    metadata: raw as Record<string, unknown>,
  }
}
