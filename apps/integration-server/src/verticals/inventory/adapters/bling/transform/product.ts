/**
 * Bling product transform.
 *
 * GET /Api/v3/produtos        — list (data: RawBlingProduct[])
 * GET /Api/v3/produtos/{id}   — single (data: RawBlingProduct)
 *
 * Key fields from Bling API v3:
 *   id, nome, codigo, preco, tipo, situacao, formato,
 *   descricaoCurta, imagemURL, dataValidade, unidade,
 *   pesoLiquido, pesoBruto, gtin, gtinEmbalagem,
 *   marca, descricaoComplementar, idProdutoPai,
 *   dimensoes { largura, altura, profundidade, unidadeMedida },
 *   fornecedor { id, contato { id, nome } },
 *   categoria { id }
 */
import type { Product } from '../../../schema/product'
import {pickStr, strMap} from './shared'

export interface RawBlingProductDimensoes {
  largura?: number
  altura?: number
  profundidade?: number
  unidadeMedida?: number | string
}

export interface RawBlingProductFornecedor {
  id?: number
  codigo?: string
  precoCusto?: number
  precoCompra?: number
  contato?: { id?: number; nome?: string }
}

export interface RawBlingProductEstoque {
  minimo?: number
  maximo?: number
  crossdocking?: number
  localizacao?: string
  saldoVirtualTotal?: number
}

export interface RawBlingProduct {
  id: number
  idProdutoPai?: number | null
  nome?: string
  codigo?: string
  preco?: number
  precoCusto?: number
  tipo?: string
  /** "A" = active, "I" = inactive */
  situacao?: string
  formato?: string
  descricaoCurta?: string
  imagemURL?: string
  dataValidade?: string
  unidade?: string
  pesoLiquido?: number
  pesoBruto?: number
  volumes?: number
  itensPorCaixa?: number
  gtin?: string
  gtinEmbalagem?: string
  marca?: string
  descricaoComplementar?: string
  linkExterno?: string
  observacoes?: string
  categoria?: { id?: number }
  estoque?: RawBlingProductEstoque
  fornecedor?: RawBlingProductFornecedor
  dimensoes?: RawBlingProductDimensoes
  [key: string]: unknown
}

export function transformProduct(raw: RawBlingProduct): Product {
  const supplierIds: string[] = []
  if (raw.fornecedor?.id != null) supplierIds.push(String(raw.fornecedor.id))

  const dims = raw.dimensoes
  const hasDims = dims && (dims.largura || dims.altura || dims.profundidade)

  // Bling prices are in BRL (float). Convert to minor units (centavos).
  const retailPriceMinor = raw.preco !== undefined ? Math.round(raw.preco * 100) : undefined

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    sku: pickStr(raw.codigo) ?? '',
    name: pickStr(raw.nome) ?? '',
    description: pickStr(raw.descricaoCurta) ?? pickStr(raw.descricaoComplementar),
    upc: pickStr(raw.gtin) ?? pickStr(raw.gtinEmbalagem),
    brand: pickStr(raw.marca),
    category: raw.categoria?.id != null ? String(raw.categoria.id) : undefined,
    unitOfMeasure: pickStr(raw.unidade) ?? 'each',
    weightGrams: raw.pesoLiquido !== undefined ? raw.pesoLiquido * 1000 : undefined,
    dimensionsCm: hasDims ? {
      length: dims.profundidade,
      width: dims.largura,
      height: dims.altura,
    } : undefined,
    retailPrice: retailPriceMinor !== undefined ? { amount: retailPriceMinor, currency: 'BRL' } : undefined,
    isActive: raw.situacao !== undefined ? raw.situacao === 'A' : true,
    parentProductId: raw.idProdutoPai != null ? String(raw.idProdutoPai) : undefined,
    supplierIds,
    createdAt: undefined,
    updatedAt: undefined,
    platform: 'bling',
    metadata: strMap({
      tipo: raw.tipo,
      formato: raw.formato,
      situacao: raw.situacao,
      dataValidade: raw.dataValidade,
      localizacao: raw.estoque?.localizacao,
      observacoes: raw.observacoes,
    }),
    raw,
  }
}
