import type { TaxRate } from '../../../schema/taxrate'

export interface DolibarrTaxRate {
  rowid?: number | string
  id?: number | string
  code?: string
  label?: string
  taux?: number
  recuperableonly?: number | string
  active?: number | string
  [key: string]: unknown
}

export function transformTaxRate(raw: DolibarrTaxRate): TaxRate {
  const id = raw.rowid ?? raw.id
  return {
    id: id !== undefined ? String(id) : raw.code ?? '',
    name: raw.label || raw.code || undefined,
    description: raw.label || undefined,
    rate: raw.taux ?? 0,
    isActive: raw.active !== 0,
    metadata: raw as Record<string, unknown>,
  }
}
