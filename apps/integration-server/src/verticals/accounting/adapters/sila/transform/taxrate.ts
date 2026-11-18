import type { TaxRate } from '../../../schema/taxrate'

// Sila does not expose tax rate endpoints.
export interface SilaStubTaxRate {
  [key: string]: unknown
}

export function transformTaxRate(raw: SilaStubTaxRate): TaxRate {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
