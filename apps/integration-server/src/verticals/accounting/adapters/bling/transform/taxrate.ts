import type { TaxRate } from '../../../schema/taxrate'

/**
 * Bling v3 impostos (tax code) shape.
 * GET /impostos — list all tax codes.
 * GET /impostos/:id — single tax code.
 *
 * Bling fiscal tax codes represent Brazilian tax classification entries
 * (ICMS tables, IPI aliquots, PIS/COFINS categories). The `id` is a
 * numeric identifier; `descricao` is the human-readable name.
 *
 * situacao: 1=active, 2=inactive.
 */
export interface BlingImposto {
  id: number
  descricao?: string
  aliquota?: number
  situacao?: number
  tipo?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: BlingImposto): TaxRate {
  return {
    id: String(raw.id),
    name: raw.descricao || undefined,
    description: raw.tipo ? `${raw.tipo}${raw.descricao ? ' — ' + raw.descricao : ''}` : (raw.descricao || undefined),
    rate: raw.aliquota ?? undefined,
    isActive: raw.situacao !== 2,
    metadata: raw as Record<string, unknown>,
  }
}
