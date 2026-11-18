import type { TaxRate } from '../../../schema/taxrate'
import { parseDecimal } from '../../shared/transform'

export interface MekariJurnalTaxRate {
  id: number
  name: string
  rate: number
  is_inclusive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: MekariJurnalTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: parseDecimal(raw.rate),
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
