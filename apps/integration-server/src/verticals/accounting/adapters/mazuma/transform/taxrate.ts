import type { TaxRate } from '../../../schema/taxrate'
import { parseDecimal } from '../../shared/transform'

export interface MazumaTaxRate {
  id: string
  name?: string
  rate?: number
  is_active?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: MazumaTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: parseDecimal(raw.rate),
    isActive: raw.is_active ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
