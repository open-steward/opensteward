import type { TaxRate } from '../../../schema/taxrate'

// Qoyod tax rate record
export interface QoyodTaxRate {
  id: number
  name?: string | null
  name_ar?: string | null
  rate?: number | null
  is_active?: boolean | null
  [key: string]: unknown
}

export function transformTaxRate(raw: QoyodTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.name || undefined,
    rate: raw.rate ?? undefined,
    isActive: raw.is_active ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
