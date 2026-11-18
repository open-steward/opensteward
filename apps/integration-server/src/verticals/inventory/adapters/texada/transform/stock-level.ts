/**
 * Transform Texada CloudLink inventory/stock records into the canonical
 * StockLevel schema.
 *
 * Texada tracks how many units of each equipment model are available,
 * on-rent, in repair, etc. per branch/depot.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawTexadaStockLevel {
  /** Equipment model / item number */
  itemNo?: string
  productId?: string
  /** Branch / depot identifier */
  branchId?: string
  locationId?: string
  branchNo?: string
  /** Total units owned at this branch */
  totalUnits?: number
  quantityOnHand?: number
  onHand?: number
  /** Units currently available for rental */
  availableUnits?: number
  available?: number
  /** Units currently on rent / committed */
  onRentUnits?: number
  onRent?: number
  committed?: number
  /** Units on order from supplier */
  onOrderUnits?: number
  onOrder?: number
  /** Units in repair / maintenance */
  inRepairUnits?: number
  inRepair?: number
  /** Reorder thresholds */
  reorderPoint?: number
  reorderQty?: number
  reorderQuantity?: number
  /** Date of last physical count */
  lastCountDate?: string
  lastCounted?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawTexadaStockLevel): StockLevel {
  const productId = pickStr(raw.itemNo ?? raw.productId) ?? ''
  const locationId = pickStr(raw.branchId ?? raw.locationId ?? raw.branchNo) ?? ''
  const quantityOnHand = pickNum(raw.totalUnits ?? raw.quantityOnHand ?? raw.onHand) ?? 0
  const quantityAvailable = pickNum(raw.availableUnits ?? raw.available)
  const quantityCommitted = pickNum(raw.onRentUnits ?? raw.onRent ?? raw.committed)
  const quantityIncoming = pickNum(raw.onOrderUnits ?? raw.onOrder)
  const reorderPoint = pickNum(raw.reorderPoint)
  const reorderQuantity = pickNum(raw.reorderQty ?? raw.reorderQuantity)
  const lastCountedAt = toIso(raw.lastCountDate ?? raw.lastCounted)

  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand,
    quantityAvailable,
    quantityCommitted,
    quantityIncoming,
    reorderPoint,
    reorderQuantity,
    lastCountedAt,
    platform: 'texada',
    metadata: strMap({ inRepair: raw.inRepairUnits ?? raw.inRepair }),
    raw,
  }
}
