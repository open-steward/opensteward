import type { TaxRate } from '../../../schema/taxrate'

export interface AcumaticaTaxRate {
  TaxID: string
  Descr: string
  TaxRate: number
  IsActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: AcumaticaTaxRate): TaxRate {
  return {
    id: raw.TaxID,
    name: raw.Descr || undefined,
    rate: raw.TaxRate,
    isActive: raw.IsActive ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
