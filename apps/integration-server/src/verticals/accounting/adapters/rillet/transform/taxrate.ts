import type { TaxRate } from '../../../schema/taxrate'

// ── Rillet API types ───────────────────────────────────────────────────────────

export interface RilletTaxRate {
  id: string
  code: string
  country: string
  description: string
  percentage: string
  [key: string]: unknown
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformTaxRate(raw: RilletTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.code || undefined,
    description: raw.description || undefined,
    rate: raw.percentage != null ? parseFloat(raw.percentage) : undefined,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
