import type { TaxRate } from '../../../schema/taxrate'

export interface TwinfieldTaxRate {
  code: string
  name: string
  shortName: string
  percentage: number
  status: string
  [key: string]: unknown
}

export function transformTaxRate(raw: TwinfieldTaxRate): TaxRate {
  return {
    id: raw.code,
    name: raw.name || undefined,
    description: raw.shortName || undefined,
    rate: raw.percentage / 100,
    isActive: raw.status !== 'hidden' && raw.status !== 'deleted',
    metadata: raw as Record<string, unknown>,
  }
}
