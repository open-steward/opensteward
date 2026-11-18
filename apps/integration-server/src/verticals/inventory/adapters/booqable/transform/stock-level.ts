/**
 * Transform a Booqable stock_item JSON:API resource into the canonical StockLevel schema.
 *
 * Booqable tracks inventory at the individual stock_item level (serial / bulk).
 * We aggregate by (product_id, location_id) to produce a per-location stock level.
 *
 * Key Booqable v4 stock_item attributes:
 *   product_id, location_id, identifier, status (available | unavailable | archived),
 *   created_at, updated_at
 *
 * Because Booqable lists individual items (not aggregated counts), we produce one
 * StockLevel per stock_item where quantityOnHand = 1. Callers that need aggregated
 * counts should group by (productId, locationId).
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso, unwrapAttributes, type JsonApiResource} from './shared'

export interface RawBooqableStockItem extends JsonApiResource {
  type: 'stock_items'
}

interface StockItemAttrs {
  id: string
  product_id?: string
  location_id?: string
  identifier?: string
  status?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawBooqableStockItem): StockLevel {
  const attrs = unwrapAttributes(raw) as StockItemAttrs
  const productId = attrs.product_id ?? ''
  const locationId = attrs.location_id ?? ''

  // available = not archived and not unavailable
  const isAvailable = (attrs.status ?? '') === 'available'

  return {
    id: attrs.id,
    productId,
    locationId,
    quantityOnHand: 1,
    quantityAvailable: isAvailable ? 1 : 0,
    lastCountedAt: toIso(attrs.updated_at),
    platform: 'booqable',
    metadata: strMap({
      identifier: attrs.identifier,
      status: attrs.status,
    }),
    raw,
  }
}
