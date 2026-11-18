import type { TaxRate } from '../../../schema/taxrate'

export interface AbraflexiTaxRate {
  id: string | number
  nazev?: string
  sazba?: number
  aktualniK?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: AbraflexiTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.nazev || undefined,
    rate: raw.sazba,
    isActive: raw.aktualniK === 'ano',
    metadata: raw as Record<string, unknown>,
  }
}
