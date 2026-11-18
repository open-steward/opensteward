/**
 * Transform a raw Olist Tiny ERP v3 product into the canonical Product schema.
 *
 * Tiny API v3 GET /produtos/{id} response fields:
 *   id, sku, descricao, descricaoComplementar, tipo (K|S|V|F|M), situacao (A|I|E),
 *   unidade, gtin, origem, marca{id,nome}, categoria{id,nome,caminhoCompleto},
 *   produtoPai{id,sku,descricao}, dimensoes{largura,altura,comprimento,pesoLiquido,pesoBruto},
 *   precos{preco,precoPromocional,precoCusto,precoCustoMedio},
 *   estoque{controlar,localizacao,minimo,maximo,quantidade},
 *   fornecedores[]{id,nome,codigoProdutoNoFornecedor},
 *   tipoVariacao (N|P|V), dataCriacao, dataAlteracao
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso, toMinorUnits} from './shared'

export interface RawTinyErpProduct {
  id: number | string
  sku?: string
  descricao?: string
  descricaoComplementar?: string
  tipo?: string
  situacao?: string
  unidade?: string
  gtin?: string
  origem?: string | number
  marca?: { id?: number | string; nome?: string }
  categoria?: { id?: number | string; nome?: string; caminhoCompleto?: string }
  produtoPai?: { id?: number | string; sku?: string; descricao?: string }
  dimensoes?: {
    largura?: number
    altura?: number
    comprimento?: number
    pesoLiquido?: number
    pesoBruto?: number
  }
  precos?: {
    preco?: number
    precoPromocional?: number
    precoCusto?: number
    precoCustoMedio?: number
  }
  estoque?: {
    controlar?: boolean
    sobEncomenda?: boolean
    localizacao?: string
    minimo?: number
    maximo?: number
    quantidade?: number
  }
  fornecedores?: Array<{ id?: number | string; nome?: string; codigoProdutoNoFornecedor?: string }>
  tipoVariacao?: string
  dataCriacao?: string
  dataAlteracao?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawTinyErpProduct): Product {
  const supplierIds: string[] = []
  for (const f of raw.fornecedores ?? []) {
    if (f.id != null) supplierIds.push(String(f.id))
  }

  const dim = raw.dimensoes
  const hasDim = dim && (dim.comprimento || dim.largura || dim.altura)

  // preco is a float BRL amount; convert to centavos (integer minor units)
  const retailPriceAmount = toMinorUnits(raw.precos?.preco)

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.descricao) ?? '',
    description: pickStr(raw.descricaoComplementar),
    upc: pickStr(raw.gtin),
    brand: pickStr(raw.marca?.nome),
    category: pickStr(raw.categoria?.caminhoCompleto ?? raw.categoria?.nome),
    unitOfMeasure: pickStr(raw.unidade) ?? 'each',
    // pesoLiquido is in kg; convert to grams
    weightGrams:
      dim?.pesoLiquido !== undefined ? Math.round(dim.pesoLiquido * 1000) : undefined,
    // comprimento/largura/altura are in cm
    dimensionsCm: hasDim
      ? { length: dim?.comprimento, width: dim?.largura, height: dim?.altura }
      : undefined,
    retailPrice:
      retailPriceAmount !== undefined
        ? { amount: retailPriceAmount, currency: 'BRL' }
        : undefined,
    // A = Ativo, I = Inativo, E = Excluido (deleted → not active). Default false.
    isActive: raw.situacao === 'A',
    isTrackingEnabled: pickBool(raw.estoque?.controlar),
    parentProductId:
      raw.produtoPai?.id != null ? String(raw.produtoPai.id) : undefined,
    supplierIds,
    createdAt: toIso(raw.dataCriacao),
    updatedAt: toIso(raw.dataAlteracao),
    platform: 'tiny-erp',
    metadata: strMap({
      tipo: raw.tipo,
      tipoVariacao: raw.tipoVariacao,
      origem: raw.origem,
      localizacaoEstoque: raw.estoque?.localizacao,
      categoriaId: raw.categoria?.id,
      marcaId: raw.marca?.id,
    }),
    raw,
  }
}
