import type { TaxRate } from '../../../schema/taxrate'

export interface SevDeskUnity {
  id: string
  name: string
  taxRate: string
  status: string
  [key: string]: unknown
}

export function transformTaxRate(raw: SevDeskUnity): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    rate: parseFloat(raw.taxRate),
    isActive: raw.status === '100',
    metadata: raw as Record<string, unknown>,
  }
}
