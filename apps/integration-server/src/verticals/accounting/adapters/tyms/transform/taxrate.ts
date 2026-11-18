import type { TaxRate } from '../../../schema/taxrate'

// ── Tyms wire type ─────────────────────────────────────────────────────────────

export interface TymsTaxRate {
  uuid: string
  name?: string
  percentage?: number
  currency?: string
  is_deductable?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Public transform ───────────────────────────────────────────────────────────

export function transformTaxRate(raw: TymsTaxRate): TaxRate {
  return {
    id: raw.uuid,
    name: raw.name || undefined,
    description: raw.name || undefined,
    rate: raw.percentage ?? undefined,
    isActive: true,  // Tyms does not expose an active flag on tax records
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
