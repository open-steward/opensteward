/**
 * eGestor ConfigTrib (Tax Group configuration) → canonical TaxRate transform.
 *
 * eGestor "configTrib" endpoint: GET /api/v1/configTrib
 * configTrib provides tax configuration groups (PIS/COFINS/ICMS/IPI rates) used
 * on products, not standalone tax rates. We expose them as TaxRate entries.
 */
import type { TaxRate } from '../../../schema/taxrate'

export interface EgestorConfigTrib {
  codigo: number
  descricao?: string
  cfop?: string
  tipo?: string | number
  padrao?: boolean
  pisAliquota?: number | string
  cofinsAliquota?: number | string
  icmsAliquota?: number | string
  ipiAliquota?: number | string
  [key: string]: unknown
}

export function transformTaxRate(raw: EgestorConfigTrib): TaxRate {
  // Use ICMS as the primary rate; fall back to PIS or 0
  const rate =
    parseFloat(String(raw.icmsAliquota ?? raw.pisAliquota ?? 0)) || undefined

  return {
    id: String(raw.codigo),
    name: raw.descricao || String(raw.codigo),
    description: raw.descricao || undefined,
    rate,
    isActive: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
