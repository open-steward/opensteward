import type { TaxRate } from '../../../schema/taxrate'

// Fortnox does not expose a dedicated /taxrates endpoint. VAT codes are used
// across accounts and articles. This interface represents the structure of a
// VAT code record as returned by platform-specific configurations.
export interface FortnoxVATCode {
  Code: string
  Description: string
  VATPercent: number
  Active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: FortnoxVATCode): TaxRate {
  return {
    id: raw.Code,
    name: raw.Description || undefined,
    description: raw.Description || undefined,
    rate: raw.VATPercent,
    isActive: raw.Active,
    metadata: raw as Record<string, unknown>,
  }
}
