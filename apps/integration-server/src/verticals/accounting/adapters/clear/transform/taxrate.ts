import type { TaxRate } from '../../../schema/taxrate'

export interface ClearGSTRate {
  id: string
  name: string
  rate: number
  hsn_code: string
  type: string
  is_active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: ClearGSTRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.type ? `${raw.type} - ${raw.hsn_code || ''}`.trim().replace(/ - $/, '') : undefined,
    rate: raw.rate,
    isActive: raw.is_active,
    metadata: raw as Record<string, unknown>,
  }
}
