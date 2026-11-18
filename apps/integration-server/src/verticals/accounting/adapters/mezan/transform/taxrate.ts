import type { TaxRate } from '../../../schema/taxrate'

// ── Mezan wire types ──────────────────────────────────────────────────────────

export interface MezanTaxType {
  id: string
  internal_name?: string
  display_name?: string
  percent?: number
  is_sales_enabled?: boolean
  is_purchasing_enabled?: boolean
  is_deductible?: boolean
  is_active?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTaxRate(raw: MezanTaxType): TaxRate {
  return {
    id: String(raw.id),
    name: raw.display_name || raw.internal_name || undefined,
    description: raw.internal_name || undefined,
    rate: raw.percent,
    isActive: raw.is_active,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
