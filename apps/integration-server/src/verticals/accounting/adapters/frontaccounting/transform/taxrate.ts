import type { TaxRate } from '../../../schema/taxrate'

export interface FATaxType {
  id?: number | string
  name?: string
  rate?: number
  sales_gl_code?: string
  purchasing_gl_code?: string
  inactive?: number | string
  [key: string]: unknown
}

export function transformTaxRate(raw: FATaxType): TaxRate {
  return {
    id: raw.id !== undefined ? String(raw.id) : '',
    name: raw.name || undefined,
    description: raw.name || undefined,
    rate: raw.rate ?? 0,
    isActive: raw.inactive !== 1,
    metadata: raw as Record<string, unknown>,
  }
}
