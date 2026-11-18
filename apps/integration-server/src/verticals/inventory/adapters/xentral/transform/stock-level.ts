/**
 * Transform a raw Xentral product-stocks object to canonical StockLevel records.
 *
 * Source: GET /api/v1/products/{id}/stocks
 *
 * The endpoint returns a single aggregate stock object per product, with
 * per-warehouse breakdowns in a `warehouses` array.  We emit one StockLevel
 * per warehouse entry so callers get location-scoped records.  If there are
 * no warehouse entries we emit a single aggregate record with an empty
 * locationId.
 *
 * Key field mappings:
 *   totals.physical    → quantityOnHand (aggregate)
 *   totals.sellable    → quantityAvailable (aggregate)
 *   totals.reserved    → quantityCommitted (aggregate)
 *   warehouses[n].id   → locationId
 *   warehouses[n].physical → per-warehouse quantityOnHand
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

interface XentralWarehouseStock {
  id?: string
  physical?: number
}

export interface RawXentralProductStocks {
  id?: string
  totals?: {
    pseudo?: number
    sellable?: number
    reserved?: number
    correction?: number
    physical?: number
    openSalesOrders?: number
    calculated?: number
    producible?: number
  }
  warehouses?: XentralWarehouseStock[]
  [key: string]: unknown
}

export function transformStockLevels(
  productId: string,
  raw: RawXentralProductStocks,
): StockLevel[] {
  const warehouses = raw.warehouses ?? []

  if (warehouses.length === 0) {
    return [buildStockLevel(productId, '', raw, undefined)]
  }

  return warehouses.map((wh) =>
    buildStockLevel(productId, wh.id ?? '', raw, wh),
  )
}

function buildStockLevel(
  productId: string,
  locationId: string,
  raw: RawXentralProductStocks,
  wh: XentralWarehouseStock | undefined,
): StockLevel {
  const onHand =
    wh !== undefined ? (wh.physical ?? 0) : (raw.totals?.physical ?? 0)

  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: onHand,
    quantityAvailable: locationId === '' ? (raw.totals?.sellable ?? undefined) : undefined,
    quantityCommitted: locationId === '' ? (raw.totals?.reserved ?? undefined) : undefined,
    platform: 'xentral',
    metadata: strMap({}),
    raw,
  }
}
