/**
 * Transform Unicommerce inventory adjustment → canonical StockAdjustment.
 *
 * Source endpoint:
 *   POST /services/rest/v1/inventory/adjust  (single adjustment)
 *
 * Unicommerce's adjust API accepts one SKU at a time (adjustmentType: ADD|REMOVE).
 * The response does not echo back full adjustment details, so this transform is
 * used on the request payload shape we reconstruct or on any audit record shapes
 * the platform surfaces.
 *
 * adjustmentType: ADD → positive delta; REMOVE → negative delta.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawUnicommerceInventoryAdjustment {
  /** A synthetic ID (sku:facility:timestamp) constructed by the adapter. */
  id?: string
  facilityCode?: string
  itemSKU?: string
  quantity?: number
  adjustmentType?: string
  inventoryType?: string
  shelfCode?: string
  remarks?: string
  adjustedAt?: number | string
  adjustedBy?: string
  [key: string]: unknown
}

function mapReason(remarks: string | undefined, inventoryType: string | undefined): StockAdjustmentReason {
  const r = (remarks ?? '').toLowerCase()
  const inv = (inventoryType ?? '').toLowerCase()
  if (r.includes('count') || r.includes('cycle')) return 'cycle_count'
  if (r.includes('damage') || inv.includes('damage')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost')) return 'lost'
  if (r.includes('found') || inv.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawUnicommerceInventoryAdjustment): StockAdjustment {
  const sku = pickStr(raw.itemSKU) ?? ''
  const facilityCode = pickStr(raw.facilityCode) ?? ''
  const id = pickStr(raw.id) ?? `${sku}:${facilityCode}:${raw.adjustedAt ?? Date.now()}`

  const baseQty = raw.quantity ?? 0
  const isRemove = (raw.adjustmentType ?? '').toUpperCase() === 'REMOVE'
  const deltaQuantity = isRemove ? -baseQty : baseQty

  return {
    id,
    externalId: id,
    locationId: facilityCode,
    reason: mapReason(raw.remarks, raw.inventoryType),
    lines: [
      {
        productId: sku,
        deltaQuantity,
        notes: pickStr(raw.remarks),
      },
    ],
    adjustedAt: toIso(raw.adjustedAt) ?? new Date().toISOString(),
    adjustedBy: pickStr(raw.adjustedBy),
    platform: 'unicommerce',
    metadata: strMap({
      adjustmentType: raw.adjustmentType,
      inventoryType: raw.inventoryType,
      shelfCode: raw.shelfCode,
    }),
    raw,
  }
}
