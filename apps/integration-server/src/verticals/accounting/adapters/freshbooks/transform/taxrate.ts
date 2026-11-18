import type { TaxRate } from '../../../schema/taxrate'

export interface FreshBooksTax {
  taxid: number
  name: string
  number: string
  amount: string
  compound: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: FreshBooksTax): TaxRate {
  return {
    id: String(raw.taxid),
    name: raw.name || undefined,
    description: raw.number || undefined,
    rate: parseFloat(raw.amount),
    metadata: raw as Record<string, unknown>,
  }
}
