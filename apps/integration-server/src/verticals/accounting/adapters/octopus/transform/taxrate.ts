/**
 * Octopus → canonical TaxRate transform.
 *
 * Octopus REST API endpoint: GET /vatCodes, GET /vatCodes/{id}
 *
 * Belgian VAT (BTW / TVA) codes define the standard rates applicable in
 * Belgian accounting. Octopus exposes these via the vatCodes resource.
 * Common Belgian VAT rates: 21%, 12%, 6%, 0%.
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface OctopusVatCode {
  vatCodeId?: number
  code?: string
  description?: string
  rate?: number
  percentage?: number
  active?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: OctopusVatCode): TaxRate {
  const id = raw.vatCodeId !== undefined ? String(raw.vatCodeId) : (raw.code ?? undefined)
  return {
    id,
    name: raw.code ? `${raw.code} – ${raw.description ?? ''}`.trimEnd() : (raw.description || undefined),
    description: raw.description || undefined,
    rate: raw.rate ?? raw.percentage,
    isActive: raw.active !== false,
    metadata: raw as Record<string, unknown>,
  }
}
