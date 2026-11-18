/**
 * Tipalti tax code → canonical TaxRate transform.
 *
 * REST endpoint: GET /api/v1/tax-codes
 *
 * Wire fields:
 *   id, externalId, name, rate, active, payerEntities[], createdAt, updatedAt
 *
 * Docs: https://documentation.tipalti.com/reference/tax-codes
 */

import type { TaxRate } from '../../../schema/taxrate'

// ── Wire types ────────────────────────────────────────────────────────────────

export interface TipaltiTaxCode {
  id: string
  externalId?: string
  name?: string
  /** Tax rate as a decimal percentage, e.g. 20.0 for 20%. */
  rate?: number
  /** Whether this tax code is currently active. */
  active?: boolean
  payerEntities?: string[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTaxCode(raw: TipaltiTaxCode): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.active,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
