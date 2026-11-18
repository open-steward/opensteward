import type { TaxRate } from '../../../schema/taxrate'

export interface DeskeraTaxCode {
  id: string
  name?: string
  percent?: number
  type?: string
  status?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: DeskeraTaxCode): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.name || undefined,
    rate: raw.percent ?? 0,
    isActive: raw.status === 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
