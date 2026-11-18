/**
 * Supy inventory balance → canonical StockLevel transform.
 *
 * Supy reports stock balances per item per branch. The API returns the
 * on-hand quantity, available quantity (on-hand minus committed), and
 * optionally a reorder point. There is no single-record fetch; results
 * are always returned as a list filtered by branch or item.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'

export interface RawSupyStockBalance {
  itemId: string
  branchId?: string
  onHand?: number
  available?: number
  committed?: number
  onOrder?: number
  reorderPoint?: number
  reorderQuantity?: number
  lastCountedAt?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawSupyStockBalance): StockLevel {
  const itemId = String(raw.itemId)
  const branchId = raw.branchId ? String(raw.branchId) : ''
  return {
    id: branchId ? `${itemId}:${branchId}` : itemId,
    productId: itemId,
    locationId: branchId,
    quantityOnHand: pickNum(raw.onHand) ?? 0,
    quantityAvailable: pickNum(raw.available),
    quantityCommitted: pickNum(raw.committed),
    quantityIncoming: pickNum(raw.onOrder),
    reorderPoint: pickNum(raw.reorderPoint),
    reorderQuantity: pickNum(raw.reorderQuantity),
    lastCountedAt: toIso(raw.lastCountedAt),
    platform: 'supy',
    metadata: strMap({}),
    raw,
  }
}
