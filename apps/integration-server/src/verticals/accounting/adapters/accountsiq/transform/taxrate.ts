import type { TaxRate } from '../../../schema/taxrate'

export interface AccountsIQTaxRate {
  taxRateId: string | number
  taxRateName: string
  taxRatePercent: number
  isActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: AccountsIQTaxRate): TaxRate {
  return {
    id: String(raw.taxRateId),
    name: raw.taxRateName || undefined,
    rate: raw.taxRatePercent,
    isActive: raw.isActive ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
