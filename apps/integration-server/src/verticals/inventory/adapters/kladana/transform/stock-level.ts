/**
 * Kladana stock level transform.
 *
 * Source: /report/stock/bystore/current
 * Key fields:
 *   assortmentId  — product/variant UUID
 *   storeId       — warehouse UUID
 *   stock         — physical quantity on hand
 *   reserve       — committed/reserved quantity
 *   inTransit     — quantity incoming (in transit)
 *   quantity      — available = stock - reserve + inTransit
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

export interface RawKladanaStockLevel {
  assortmentId: string
  storeId?: string
  stock?: number
  reserve?: number
  inTransit?: number
  quantity?: number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawKladanaStockLevel): StockLevel {
  const storeId = raw.storeId ?? ''
  return {
    id: `${raw.assortmentId}:${storeId}`,
    productId: raw.assortmentId,
    locationId: storeId,
    quantityOnHand: raw.stock ?? 0,
    quantityAvailable: raw.quantity,
    quantityCommitted: raw.reserve,
    quantityIncoming: raw.inTransit,
    platform: 'kladana',
    metadata: strMap({}),
    raw,
  }
}
