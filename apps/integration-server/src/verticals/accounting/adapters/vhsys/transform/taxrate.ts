/**
 * vhsys tax rate (alíquota / tributação) transform.
 *
 * vhsys does not expose a standalone tax-rate endpoint. Tax information is
 * embedded inside product and order records. This module models a synthetic
 * "tax rate" derived from vhsys product tax fields or fiscal-regime settings.
 *
 * Endpoints (product-level tax fields):
 *   GET /tributacoes   — list tax configurations (if available)
 */
import type { TaxRate } from '../../../schema/taxrate'

// ── Raw API types ─────────────────────────────────────────────────────────────

export interface VhsysTributacao {
  id_tributacao: string | number
  descricao_tributacao?: string
  aliquota?: number | string  // percentage, e.g. 12.5
  situacao?: string           // 'A' = active, 'I' = inactive
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTaxRate(raw: VhsysTributacao): TaxRate {
  return {
    id: String(raw.id_tributacao),
    name: raw.descricao_tributacao || undefined,
    description: raw.descricao_tributacao || undefined,
    rate: raw.aliquota !== undefined ? Number(raw.aliquota) : undefined,
    isActive: raw.situacao !== 'I',
    metadata: raw as Record<string, unknown>,
  }
}
