import type { TaxRate } from '../../../schema/taxrate'

// Paga does not expose tax rate endpoints.
export interface PagaStubTaxRate {
  [key: string]: unknown
}

export function transformTaxRate(raw: PagaStubTaxRate): TaxRate {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
