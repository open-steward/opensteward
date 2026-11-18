import type { TaxRate } from '../../../schema/taxrate'

export interface ErpNextTaxRateDetail {
  tax_rate: number
  [key: string]: unknown
}

export interface ErpNextTaxRate {
  name: string
  title: string
  tax_rate?: number
  taxes?: ErpNextTaxRateDetail[]
  disabled: number | boolean
  [key: string]: unknown
}

function resolveRate(raw: ErpNextTaxRate): number | undefined {
  if (typeof raw.tax_rate === 'number') return raw.tax_rate
  if (raw.taxes && raw.taxes.length > 0) return raw.taxes[0]?.tax_rate
  return undefined
}

export function transformTaxRate(raw: ErpNextTaxRate): TaxRate {
  return {
    id: raw.name,
    name: raw.title || raw.name || undefined,
    rate: resolveRate(raw),
    isActive: !raw.disabled,
    metadata: raw as Record<string, unknown>,
  }
}
