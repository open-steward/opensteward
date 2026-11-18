/**
 * Openbravo MaterialMgmtStorageDetail → canonical StockLevel.
 *
 * Entity: MaterialMgmtStorageDetail (table: M_Storage_Detail)
 * Endpoint: /openbravo/org.openbravo.service.json.jsonrest/MaterialMgmtStorageDetail
 *
 * Each row represents the quantity of a product in a specific storage bin
 * (Locator). The warehouse is reachable via storageBin.warehouse.id.
 *
 * Fields used:
 *   id, product.id, storageBin.id, storageBin.warehouse.id,
 *   quantityOnHand, reservedQty, orderQty, updated
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'

export interface RawOpenbravoStorageDetail {
  /** UUID primary key */
  id: string
  product?: { id?: string }
  /** Storage bin (M_Locator) */
  storageBin?: { id?: string; warehouse?: { id?: string } }
  quantityOnHand?: number | string
  /** Quantity committed / reserved */
  reservedQty?: number | string
  /** Quantity on open purchase orders (incoming) */
  orderQty?: number | string
  updated?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawOpenbravoStorageDetail): StockLevel {
  const productId = raw.product?.id ?? ''
  const locationId = raw.storageBin?.id ?? ''
  const onHand = pickNum(raw.quantityOnHand) ?? 0
  const reserved = pickNum(raw.reservedQty)
  const incoming = pickNum(raw.orderQty)

  return {
    id: raw.id,
    productId,
    locationId,
    quantityOnHand: onHand,
    quantityAvailable: reserved !== undefined ? onHand - reserved : undefined,
    quantityCommitted: reserved,
    quantityIncoming: incoming,
    lastCountedAt: toIso(raw.updated),
    platform: 'openbravo',
    metadata: strMap({ warehouseId: raw.storageBin?.warehouse?.id }),
    raw,
  }
}
