import type { TaxRate } from '../../../schema/taxrate'

export interface OmieTaxRate {
  codigo_imposto: number
  nome: string
  descricao: string
  aliquota: number
  ativo: string
  [key: string]: unknown
}

export function transformTaxRate(raw: OmieTaxRate): TaxRate {
  return {
    id: String(raw.codigo_imposto),
    name: raw.nome || undefined,
    description: raw.descricao || undefined,
    rate: raw.aliquota,
    isActive: raw.ativo === 'S',
    metadata: raw as Record<string, unknown>,
  }
}
