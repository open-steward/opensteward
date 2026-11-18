import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

/**
 * Raw shape for inventory-adjustment records in Agiliron API v4.0.
 *
 * Agiliron does not have a first-class InventoryAdjustment REST endpoint;
 * adjustments are inferred from product-inventory history changes or via the
 * ProductsInventory endpoint.  This type models the closest available shape.
 *
 * When the platform exposes an explicit adjustment endpoint the field names
 * should be updated to match.
 */
export interface RawAgilironAdjustment {
  AdjustmentId?: string
  ProductCode?: string
  StockLocation?: string
  AdjustmentQty?: number | string
  /** Positive (add) or negative (remove) delta quantity */
  QtyChange?: number | string
  Reason?: string
  AdjustmentType?: string
  AdjustedBy?: string
  AdjustedOn?: string
  Notes?: string
  [key: string]: unknown
}

function mapReason(raw: RawAgilironAdjustment): StockAdjustmentReason {
  const r = ((raw.Reason ?? raw.AdjustmentType) ?? '').toLowerCase()
  if (r.includes('count')) return 'cycle_count'
  if (r.includes('damage')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawAgilironAdjustment): StockAdjustment {
  const id = pickStr(raw.AdjustmentId) ?? `${raw.ProductCode ?? 'unknown'}:${raw.AdjustedOn ?? Date.now()}`
  const delta = pickNum(raw.QtyChange ?? raw.AdjustmentQty) ?? 0

  return {
    id,
    externalId: id,
    locationId: pickStr(raw.StockLocation) ?? '',
    reason: mapReason(raw),
    lines: [{
      productId: pickStr(raw.ProductCode) ?? '',
      deltaQuantity: delta,
      notes: pickStr(raw.Notes),
    }],
    adjustedAt: toIso(raw.AdjustedOn) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.AdjustedBy),
    platform: 'agiliron',
    metadata: strMap({ rawReason: raw.Reason, adjustmentType: raw.AdjustmentType }),
    raw,
  }
}
