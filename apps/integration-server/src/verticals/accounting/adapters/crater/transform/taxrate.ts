import type { TaxRate } from '../../../schema/taxrate'

// ── Crater wire type ──────────────────────────────────────────────────────────

export interface CraterTaxType {
  id: string
  name: string
  percent: number
  description?: string
  business_id?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTaxRate(raw: CraterTaxType): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.percent,
    isActive: true, // Crater has no archived flag on tax types
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
