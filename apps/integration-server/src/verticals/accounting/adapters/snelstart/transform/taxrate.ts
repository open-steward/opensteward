import type { TaxRate } from '../../../schema/taxrate'

export interface SnelStartTaxRate {
  id: string
  naam: string
  percentage: number
  isActief: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: SnelStartTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.naam || undefined,
    rate: raw.percentage != null ? raw.percentage / 100 : 0,
    isActive: raw.isActief,
    metadata: raw as Record<string, unknown>,
  }
}
