/**
 * Tiny ERP v3 — Aliquotas (Tax Rates) transform.
 *
 * Endpoint: GET /v3/aliquotas
 * Tiny exposes tax rates (alíquotas de impostos) for Brazilian fiscal documents.
 * Each entry has an id, name, percentage (percentual), and active flag (situacao).
 *
 * situacao: 1 = Ativo (active), 0 = Inativo (archived)
 */

import type { TaxRate } from '../../../schema/taxrate'

// ── Raw Tiny type ──────────────────────────────────────────────────────────────

export interface TinyAliquota {
  id?: number | string | null
  descricao?: string | null
  percentual?: number | null
  situacao?: number | null   // 1 = Ativo, 0 = Inativo
  [key: string]: unknown
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformTaxRate(raw: TinyAliquota): TaxRate {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.descricao || undefined,
    description: raw.descricao || undefined,
    rate: raw.percentual ?? undefined,
    isActive: raw.situacao === 1,
    metadata: raw as Record<string, unknown>,
  }
}
