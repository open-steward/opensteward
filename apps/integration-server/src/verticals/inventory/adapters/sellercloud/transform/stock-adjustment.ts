/**
 * Transform a synthetic Sellercloud stock-adjustment record.
 *
 * NOTE: The Sellercloud REST API exposes inventory adjustments as write-only
 * operations (PUT /rest/api/Inventory/AdjustPhysicalInventory).  There is no
 * documented read/list endpoint for historical adjustments.  This transform is
 * provided to handle any webhook or synthetic audit payloads that carry
 * adjustment data in a compatible shape.
 *
 * Docs: https://developer.sellercloud.com/dev-article/adjust-physical-inventory/
 *
 * Key field mappings:
 *   ProductID     → lines[0].productId
 *   WarehouseID   → locationId
 *   Qty           → lines[0].deltaQuantity (sign depends on AdjustmentType)
 *   AdjustmentType → reason  (0=Subtract, 1=Add → mapped to canonical reasons)
 *   Reason        → metadata.reason / canonical reason mapping
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawSellercloudStockAdjustment {
  /** Synthetic ID — Sellercloud does not return one from the adjust endpoint */
  ID?: string | number
  ProductID?: string | number
  WarehouseID?: number | string
  /** Quantity adjusted (always positive; sign determined by AdjustmentType) */
  Qty?: number
  /** 0 = Subtract, 1 = Add */
  AdjustmentType?: number
  Reason?: string
  AdjustedAt?: string
  AdjustedBy?: string
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count')) return 'cycle_count'
  if (r.includes('damage')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawSellercloudStockAdjustment): StockAdjustment {
  const id = raw.ID != null ? String(raw.ID) : `sellercloud:adj:${raw.ProductID}:${Date.now()}`
  const locationId = raw.WarehouseID != null ? String(raw.WarehouseID) : ''
  const productId = raw.ProductID != null ? String(raw.ProductID) : ''

  // AdjustmentType: 0 = Subtract (negative delta), 1 = Add (positive delta)
  const qty = raw.Qty ?? 0
  const delta = raw.AdjustmentType === 0 ? -qty : qty

  return {
    id,
    externalId: id,
    locationId,
    reason: mapReason(raw.Reason),
    lines: [
      {
        productId,
        deltaQuantity: delta,
      },
    ],
    adjustedAt: toIso(raw.AdjustedAt) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.AdjustedBy),
    platform: 'sellercloud',
    metadata: strMap({ reason: raw.Reason, adjustmentType: raw.AdjustmentType }),
    raw,
  }
}
