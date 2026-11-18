/**
 * Soldo VAT rate → canonical TaxRate.
 *
 * Soldo exposes company-level VAT rate definitions that can be assigned to
 * transactions. These map to the canonical TaxRate resource.
 *
 * Endpoint: GET /business/v2/entities/tax-rate
 *           GET /business/v2/entities/tax-rate/{taxRateId}
 *
 * VatRate fields:
 *   id, code, name, description, percentage, enabled,
 *   integration, creation_time, last_update_time
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface SoldoVatRate {
  id: string
  code?: string
  name?: string
  description?: string
  percentage?: number
  enabled?: boolean
  integration?: string
  creation_time?: string
  last_update_time?: string
  [key: string]: unknown
}

export function transformVatRate(raw: SoldoVatRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name ?? raw.code ?? undefined,
    description: raw.description ?? undefined,
    rate: raw.percentage ?? undefined,
    isActive: raw.enabled ?? undefined,
    createdAt: raw.creation_time ? new Date(raw.creation_time) : undefined,
    updatedAt: raw.last_update_time ? new Date(raw.last_update_time) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
