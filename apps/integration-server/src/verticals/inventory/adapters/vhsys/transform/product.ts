import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

/**
 * Raw product record returned by GET /v2/produtos or GET /v2/produtos/:id.
 * Field names are in Portuguese as documented in the VHSYS API v2.
 */
export interface RawVhsysProduct {
  id_produto: string | number
  cod_produto?: string
  desc_produto?: string
  marca_produto?: string
  atalho_produto?: string
  id_categoria?: string | number
  id_fornecedor?: string | number
  fornecedor_produto?: string
  fornecedor_produto_id?: string | number
  id_produto_parent?: string | number
  produto_variado?: string | number | boolean
  estoque_produto?: number | string
  minimo_produto?: number | string
  maximo_produto?: number | string
  unidade_produto?: string
  valor_produto?: number | string
  valor_custo_produto?: number | string
  peso_produto?: number | string
  codigo_barra_produto?: string
  ncm_produto?: string
  icms_produto?: number | string
  ipi_produto?: number | string
  obs_produto?: string
  ativo_produto?: string | number | boolean
  data_cadastro_produto?: string
  data_alteracao_produto?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawVhsysProduct): Product {
  const id = String(raw.id_produto)

  const supplierId = raw.fornecedor_produto_id ?? raw.id_fornecedor
  const supplierIds: string[] = supplierId != null && String(supplierId) !== '' ? [String(supplierId)] : []

  const retailPriceVal = pickNum(raw.valor_produto)
  const costVal = pickNum(raw.valor_custo_produto)
  const weightKg = pickNum(raw.peso_produto)

  return {
    id,
    externalId: id,
    sku: pickStr(raw.cod_produto) ?? '',
    name: pickStr(raw.desc_produto) ?? '',
    description: pickStr(raw.obs_produto),
    upc: pickStr(raw.codigo_barra_produto),
    brand: pickStr(raw.marca_produto),
    category: raw.id_categoria != null ? String(raw.id_categoria) : undefined,
    unitOfMeasure: pickStr(raw.unidade_produto) ?? 'each',
    weightGrams: weightKg !== undefined ? weightKg * 1000 : undefined,
    cost: costVal !== undefined ? { amount: Math.round(costVal * 100), currency: 'BRL' } : undefined,
    retailPrice: retailPriceVal !== undefined ? { amount: Math.round(retailPriceVal * 100), currency: 'BRL' } : undefined,
    isActive: pickBool(raw.ativo_produto) ?? true,
    parentProductId: raw.id_produto_parent != null && String(raw.id_produto_parent) !== ''
      ? String(raw.id_produto_parent)
      : undefined,
    supplierIds,
    createdAt: toIso(raw.data_cadastro_produto),
    updatedAt: toIso(raw.data_alteracao_produto),
    platform: 'vhsys',
    metadata: strMap({
      shortcut: raw.atalho_produto,
      ncm: raw.ncm_produto,
      icms: raw.icms_produto,
      ipi: raw.ipi_produto,
      minStock: raw.minimo_produto,
      maxStock: raw.maximo_produto,
      isVariant: raw.produto_variado,
    }),
    raw,
  }
}
