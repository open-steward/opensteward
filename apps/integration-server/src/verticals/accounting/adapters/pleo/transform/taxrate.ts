/**
 * Transform Pleo tax code to canonical TaxRate.
 *
 * Pleo API: GET /tax-codes, GET /tax-codes/{taxCodeId}
 * Response fields: id, name, code, rate, type (NORMAL|REVERSE), enabled, createdAt, updatedAt
 *
 * Docs: https://developers.pleo.io/reference/gettaxcodes
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface PleoTaxCode {
  id: string
  name: string
  code?: string
  rate?: number
  type?: string
  enabled?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: PleoTaxCode): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.code || undefined,
    rate: raw.rate,
    isActive: raw.enabled ?? true,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
