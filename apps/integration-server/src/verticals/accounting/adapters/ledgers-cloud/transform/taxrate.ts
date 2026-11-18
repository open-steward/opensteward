/**
 * LEDGERS.Cloud GST/tax rate transform.
 *
 * Endpoint: GET /v3/list-gst-rates  (reference data)
 *
 * Wire fields: id, name, description, rate (%), is_active / status
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface LedgersTaxRate {
  id?: string | number
  name?: string
  description?: string
  rate?: number
  percentage?: number
  is_active?: boolean
  status?: string               // "active" | "inactive"
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: LedgersTaxRate): TaxRate {
  const isActive =
    raw.is_active ?? (raw.status ? raw.status.toLowerCase() === 'active' : undefined)
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.rate ?? raw.percentage,
    isActive,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
