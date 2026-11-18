/**
 * Refrens tax-rate transform.
 *
 * Refrens does not expose a dedicated tax-rates endpoint. GST rates are
 * defined per line item (igst/cgst/sgst percentages) rather than as named
 * tax-rate objects. This file is present for interface completeness; the
 * adapter does not implement listTaxRates / getTaxRate.
 */

import type { TaxRate } from '../../../schema/taxrate'

// Placeholder shape
export interface RefrensTaxRate {
  id: string
  name?: string
  rate?: number
  [key: string]: unknown
}

export function transformTaxRate(raw: RefrensTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    rate: raw.rate ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
