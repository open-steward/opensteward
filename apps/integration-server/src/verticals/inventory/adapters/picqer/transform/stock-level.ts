import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

/**
 * Raw warehouse-level stock object from GET /products/{idproduct}/stock
 * or GET /warehouses/{idwarehouse}/stock.
 *
 * Field reference: https://picqer.com/en/api/product-stock
 */
export interface RawPicqerStockLevel {
  idproduct: number
  idwarehouse: number
  stock: number
  reserved?: number
  reservedbackorders?: number
  reservedpicklists?: number
  reservedallocations?: number
  freestock?: number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawPicqerStockLevel): StockLevel {
  const productId = String(raw.idproduct)
  const warehouseId = String(raw.idwarehouse)
  return {
    id: `${productId}:${warehouseId}`,
    productId,
    locationId: warehouseId,
    quantityOnHand: raw.stock,
    quantityAvailable: raw.freestock,
    quantityCommitted: raw.reserved,
    platform: 'picqer',
    metadata: strMap({
      reservedbackorders: raw.reservedbackorders,
      reservedpicklists: raw.reservedpicklists,
      reservedallocations: raw.reservedallocations,
    }),
    raw,
  }
}
