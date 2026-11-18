import type { TaxRate } from '../../../schema/taxrate'

// Kora does not expose tax rate configuration endpoints.
export interface KoraStubTaxRate {
  [key: string]: unknown
}

export function transformTaxRate(raw: KoraStubTaxRate): TaxRate {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
