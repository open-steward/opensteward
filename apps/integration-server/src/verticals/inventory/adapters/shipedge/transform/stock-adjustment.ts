import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickNum, pickStr, strMap, toIso} from './shared'

/**
 * ShipEdge inventory adjustment record.
 *
 * ShipEdge does not expose a public REST endpoint for listing stock
 * adjustments. This transform targets the Inventory Block API (v2) response
 * shape (OMS-side block/unblock operations) and any future adjustment endpoint.
 * Field names follow ShipEdge's snake_case convention.
 */
export interface RawShipEdgeStockAdjustment {
  adjustment_id: string | number
  warehouse?: string
  reason?: string
  status?: string
  items?: Array<{
    sku: string
    delta?: number | string
    qty_counted?: number | string
    notes?: string
  }>
  adjusted_date?: string
  adjusted_by?: string
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

export function transformStockAdjustment(raw: RawShipEdgeStockAdjustment): StockAdjustment {
  const id = String(raw.adjustment_id)
  return {
    id,
    externalId: id,
    locationId: pickStr(raw.warehouse) ?? '',
    reason: mapReason(raw.reason),
    lines: (raw.items ?? []).map((item) => ({
      productId: item.sku,
      deltaQuantity: pickNum(item.delta) ?? 0,
      countedQuantity: pickNum(item.qty_counted),
      notes: item.notes,
    })),
    adjustedAt: toIso(raw.adjusted_date) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjusted_by),
    platform: 'shipedge',
    metadata: strMap({ rawReason: raw.reason, status: raw.status }),
    raw,
  }
}
