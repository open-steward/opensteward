import type { TaxRate } from '../../../schema/taxrate'

export interface MoneybirdTaxRate {
  id?: number | string
  name?: string
  percentage?: string | number
  active?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: MoneybirdTaxRate): TaxRate {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.name || undefined,
    rate: raw.percentage !== undefined ? Number(raw.percentage) : undefined,
    isActive: raw.active ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
