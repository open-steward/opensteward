import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'

/**
 * Raw stock-level record returned by GET /v2/estoque or GET /v2/estoque/:id_produto.
 * VHSYS exposes per-product-per-deposit stock. When no deposit breakdown is
 * available, id_deposito / nome_deposito may be absent (global stock row).
 */
export interface RawVhsysStockLevel {
  id_produto: string | number
  id_deposito?: string | number
  nome_deposito?: string
  estoque_atual?: number | string
  estoque_disponivel?: number | string
  estoque_reservado?: number | string
  estoque_entrada?: number | string
  minimo_produto?: number | string
  maximo_produto?: number | string
  data_ultimo_inventario?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawVhsysStockLevel): StockLevel {
  const productId = String(raw.id_produto)
  const locationId = raw.id_deposito != null ? String(raw.id_deposito) : ''
  const id = locationId ? `${productId}:${locationId}` : productId

  return {
    id,
    productId,
    locationId,
    quantityOnHand: pickNum(raw.estoque_atual) ?? 0,
    quantityAvailable: pickNum(raw.estoque_disponivel),
    quantityCommitted: pickNum(raw.estoque_reservado),
    quantityIncoming: pickNum(raw.estoque_entrada),
    reorderPoint: pickNum(raw.minimo_produto),
    reorderQuantity: pickNum(raw.maximo_produto),
    lastCountedAt: toIso(raw.data_ultimo_inventario),
    platform: 'vhsys',
    metadata: strMap({ depositName: raw.nome_deposito }),
    raw,
  }
}
