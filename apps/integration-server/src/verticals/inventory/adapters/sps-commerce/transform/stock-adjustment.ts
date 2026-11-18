/**
 * SPS Commerce stock-adjustment transform (forward-compatibility stub).
 *
 * NOTE: The SPS Commerce public REST API does not expose a stock-adjustment
 * (inventory correction / cycle-count) endpoint.  SPS Commerce is primarily
 * a retail EDI network; its Fulfillment API provides inventory positions via
 * the EDI 846 Inventory Inquiry / Advice (inventory-advises endpoint) which
 * reports on-hand quantities but does not expose individual adjustment records
 * or the reason/delta history for quantity changes.
 *
 * This transform is provided for completeness and forward-compatibility.
 * It is NOT wired into listStockAdjustments / getStockAdjustment in index.ts
 * because there is no source endpoint to call.
 *
 * If SPS Commerce adds an adjustment-record read endpoint in a future API
 * revision, wire it in index.ts and remove this notice.
 *
 * Reference: https://docs.api.spscommerce.com/
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawSpsCommerceAdjustmentLine {
  /** Item identifier */
  item_id?: string
  /** Buyer-assigned item number */
  buyer_item_number?: string
  /** Quantity change: positive = add, negative = remove */
  quantity_change?: number
  /** Resulting on-hand quantity after adjustment */
  quantity_on_hand?: number
  notes?: string
  [key: string]: unknown
}

export interface RawSpsCommerceStockAdjustment {
  /** SPS Commerce internal adjustment identifier */
  adjustment_id: string
  /** Location / warehouse identifier */
  location_id?: string
  location?: string
  /** Human-readable reason string */
  reason?: string
  /** ISO-8601 or date string when the adjustment was recorded */
  adjusted_at?: string
  /** Username or display name of the operator */
  adjusted_by?: string
  lines?: RawSpsCommerceAdjustmentLine[]
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count')) return 'cycle_count'
  if (r.includes('damage')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost') || r.includes('loss')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawSpsCommerceStockAdjustment): StockAdjustment {
  const id = raw.adjustment_id
  const locationId =
    raw.location_id != null
      ? String(raw.location_id)
      : pickStr(raw.location) ?? ''

  return {
    id,
    externalId: id,
    locationId,
    reason: mapReason(raw.reason),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.item_id != null ? String(l.item_id) : pickStr(l.buyer_item_number) ?? '',
      deltaQuantity: l.quantity_change ?? 0,
      countedQuantity: l.quantity_on_hand,
      notes: pickStr(l.notes),
    })),
    adjustedAt: toIso(raw.adjusted_at) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjusted_by),
    platform: 'sps-commerce',
    metadata: strMap({ rawReason: raw.reason }),
    raw,
  }
}
