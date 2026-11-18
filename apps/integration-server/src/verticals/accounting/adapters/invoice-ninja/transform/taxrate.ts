/**
 * Invoice Ninja v5 tax rate transforms.
 *
 * Endpoint: GET /api/v1/tax_rates
 * Single:   GET /api/v1/tax_rates/{id}
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface InvoiceNinjaTaxRate {
  id: string
  name?: string | null
  rate?: number | null
  is_inclusive?: boolean | null
  is_deleted?: boolean | null
  updated_at?: number | null
  created_at?: number | null
  [key: string]: unknown
}

function parseEpoch(n?: number | null): Date | undefined {
  if (!n) return undefined
  return new Date(n * 1000)
}

export function transformTaxRate(raw: InvoiceNinjaTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    rate: raw.rate ?? undefined,
    isActive: !raw.is_deleted,
    createdAt: parseEpoch(raw.created_at),
    updatedAt: parseEpoch(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
