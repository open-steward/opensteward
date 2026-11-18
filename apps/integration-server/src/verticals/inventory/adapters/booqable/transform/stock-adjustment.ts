/**
 * Transform a Booqable stock_adjustment JSON:API resource into the canonical StockAdjustment schema.
 *
 * Key Booqable v4 stock_adjustment attributes:
 *   product_id, location_id, quantity (positive = add, negative = remove),
 *   reason, note, employee_id, created_at, updated_at
 *
 * Booqable stock_adjustments are bulk (non-trackable) quantity changes.
 * Trackable item changes go through stock_item create/archive flows, not adjustments.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso, unwrapAttributes, type JsonApiResource} from './shared'

export interface RawBooqableStockAdjustment extends JsonApiResource {
  type: 'stock_adjustments'
}

interface StockAdjustmentAttrs {
  id: string
  product_id?: string
  location_id?: string
  quantity?: number
  reason?: string
  note?: string
  employee_id?: string
  created_at?: string
  updated_at?: string
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

export function transformStockAdjustment(raw: RawBooqableStockAdjustment): StockAdjustment {
  const attrs = unwrapAttributes(raw) as StockAdjustmentAttrs

  return {
    id: attrs.id,
    externalId: attrs.id,
    locationId: attrs.location_id ?? '',
    reason: mapReason(attrs.reason),
    lines: attrs.product_id
      ? [{
          productId: attrs.product_id,
          deltaQuantity: attrs.quantity ?? 0,
          notes: pickStr(attrs.note),
        }]
      : [],
    adjustedAt: toIso(attrs.created_at) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(attrs.employee_id),
    platform: 'booqable',
    metadata: strMap({ rawReason: attrs.reason }),
    raw,
  }
}
