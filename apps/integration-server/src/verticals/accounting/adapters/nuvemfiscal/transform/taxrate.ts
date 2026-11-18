import type { TaxRate } from '../../../schema/taxrate'

export interface NuvemFiscalAliquota {
  id_aliquota: number
  nome: string
  descricao: string
  percentual: number
  ativa: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: NuvemFiscalAliquota): TaxRate {
  return {
    id: String(raw.id_aliquota),
    name: raw.nome || undefined,
    description: raw.descricao || undefined,
    rate: raw.percentual,
    isActive: raw.ativa,
    metadata: raw as Record<string, unknown>,
  }
}
