/**
 * Yuki VAT / tax rate transform.
 *
 * Yuki does not expose a dedicated tax-rates endpoint. VAT percentages are
 * embedded in invoice line items (VATPercentage field, VATType code).
 *
 * We expose the well-known Dutch/Belgian VAT rates as static data so that
 * callers can list and reference them by canonical id. VATType codes map as:
 *
 *   Code 0  → 0%   (Exempt)
 *   Code 1  → 21%  (High — NL/BE standard)
 *   Code 2  → 9%   (Low — NL) / 6% (Low — BE)
 *   Code 4  → 0%   (Zero-rated)
 *   Code 6  → 0%   (Export outside EU)
 *   Code 7  → 0%   (Export within EU / ICP)
 *   Code 17 → 0%   (Reverse charge)
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface YukiVATRate {
  code: string
  name: string
  rate: number
  isActive: boolean
}

export const YUKI_VAT_RATES: YukiVATRate[] = [
  { code: '1', name: 'High VAT (21%)', rate: 21, isActive: true },
  { code: '2', name: 'Low VAT (9%)', rate: 9, isActive: true },
  { code: '0', name: 'Exempt (0%)', rate: 0, isActive: true },
  { code: '4', name: 'Zero-rated (0%)', rate: 0, isActive: true },
  { code: '6', name: 'Export outside EU (0%)', rate: 0, isActive: true },
  { code: '7', name: 'Export within EU / ICP (0%)', rate: 0, isActive: true },
  { code: '17', name: 'Reverse charge (0%)', rate: 0, isActive: true },
]

export function transformTaxRate(raw: YukiVATRate): TaxRate {
  return {
    id: `vat_${raw.code}`,
    name: raw.name,
    description: raw.name,
    rate: raw.rate,
    isActive: raw.isActive,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
