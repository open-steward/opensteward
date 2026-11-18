import type { TaxRate } from '../../../schema/taxrate'

export interface UnimicroTaxRate {
  ID?: number
  Name?: string
  VatPercent?: number
  Active?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: UnimicroTaxRate): TaxRate {
  return {
    id: String(raw.ID ?? ''),
    name: raw.Name || undefined,
    description: raw.Name || undefined,
    rate: raw.VatPercent,
    isActive: raw.Active ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
