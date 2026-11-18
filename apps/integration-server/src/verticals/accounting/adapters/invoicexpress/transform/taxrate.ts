import type { TaxRate } from '../../../schema/taxrate'

export interface InvoiceXpressTaxRate {
  id: number
  name: string
  value: number
  region: string
  [key: string]: unknown
}

export function transformTaxRate(raw: InvoiceXpressTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    rate: raw.value,
    metadata: raw as Record<string, unknown>,
  }
}
