/**
 * Transform Extensiv Order Manager product stock totals → canonical StockLevel.
 *
 * Real API: GET /api/v1/productstocks/total
 * Key fields: productId, masterSku, onHandQuantity, inTransitQuantity,
 *             lockedQuantity, availableQuantity (= onHand - locked - allocated)
 *
 * The API also exposes per-bin inventory via GET /api/v1/inventory which has
 * stockLocation.warehouseId — we use that for warehouse-scoped records.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

export interface RawExtensivProductStockTotal {
  productId?: number | string | null
  masterSku?: string | null
  name?: string | null
  onHandQuantity?: number | null
  availableQuantity?: number | null
  inTransitQuantity?: number | null
  lockedQuantity?: number | null
  [key: string]: unknown
}

export interface RawExtensivInventoryRecord {
  productStockId?: number | string | null
  quantity?: number | null
  allocatedQuantity?: number | null
  availableQuantity?: number | null
  quantityLocked?: number | null
  product?: {
    productId?: number | string | null
    masterSku?: string | null
  } | null
  stockLocation?: {
    stockLocationId?: number | string | null
    warehouseId?: number | string | null
    location?: string | null
  } | null
  warehouseStockTotals?: {
    onHandQuantity?: number | null
    availableQuantity?: number | null
    inTransitQuantity?: number | null
    allocatedQuantity?: number | null
    lockedQuantity?: number | null
  } | null
  [key: string]: unknown
}

/** Transform a product-stock-total record (aggregate, no warehouse scope) */
export function transformProductStockTotal(raw: RawExtensivProductStockTotal): StockLevel {
  const productId = String(raw.productId ?? '')
  return {
    id: `extensiv:total:${productId}`,
    productId,
    locationId: '',
    quantityOnHand: raw.onHandQuantity ?? 0,
    quantityAvailable: raw.availableQuantity ?? undefined,
    quantityCommitted: raw.lockedQuantity ?? undefined,
    quantityIncoming: raw.inTransitQuantity ?? undefined,
    platform: 'extensiv-order-manager',
    metadata: strMap({ masterSku: raw.masterSku, name: raw.name }),
    raw,
  }
}

/** Transform a per-bin inventory record (warehouse + bin scoped) */
export function transformInventoryRecord(raw: RawExtensivInventoryRecord): StockLevel {
  const productId = String(raw.product?.productId ?? '')
  const warehouseId = String(raw.stockLocation?.warehouseId ?? '')
  const locationId = String(raw.stockLocation?.stockLocationId ?? warehouseId)
  const totals = raw.warehouseStockTotals
  return {
    id: `extensiv:inv:${raw.productStockId ?? `${productId}:${locationId}`}`,
    productId,
    locationId,
    quantityOnHand: totals?.onHandQuantity ?? raw.quantity ?? 0,
    quantityAvailable: totals?.availableQuantity ?? raw.availableQuantity ?? undefined,
    quantityCommitted: totals?.allocatedQuantity ?? raw.allocatedQuantity ?? undefined,
    quantityIncoming: totals?.inTransitQuantity ?? undefined,
    platform: 'extensiv-order-manager',
    metadata: strMap({
      masterSku: raw.product?.masterSku,
      binLocation: raw.stockLocation?.location,
      warehouseId,
    }),
    raw,
  }
}
