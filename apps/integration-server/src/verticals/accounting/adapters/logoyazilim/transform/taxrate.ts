import type { TaxRate } from '../../../schema/taxrate'

export interface LogoTaxRate {
  id: string
  Name?: string
  Rate?: number
  IsActive?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: LogoTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.Name || undefined,
    rate: raw.Rate,
    isActive: raw.IsActive ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
