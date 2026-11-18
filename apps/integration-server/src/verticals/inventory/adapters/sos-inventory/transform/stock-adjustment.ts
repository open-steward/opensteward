/**
 * SOS Inventory v2 stock adjustment transform.
 *
 * The public v2 REST API does not include a dedicated adjustment list endpoint.
 * This module is retained for structural parity; the adapter index does NOT
 * implement listStockAdjustments / getStockAdjustment.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawSosInventoryStockAdjustment {
  id: number | string
  location?: { id?: number | string; name?: string }
  reason?: string
  memo?: string
  date?: string
  createdBy?: string
  lines?: Array<{
    item?: { id?: number | string; name?: string }
    quantity?: number
    newQuantity?: number
    notes?: string
  }>
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

export function transformStockAdjustment(raw: RawSosInventoryStockAdjustment): StockAdjustment {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    locationId: raw.location?.id !== undefined ? String(raw.location.id) : '',
    reason: mapReason(raw.reason),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.item?.id !== undefined ? String(l.item.id) : '',
      deltaQuantity: l.quantity ?? 0,
      countedQuantity: l.newQuantity,
      notes: l.notes,
    })),
    adjustedAt: toIso(raw.date) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.createdBy),
    platform: 'sos-inventory',
    metadata: strMap({ rawReason: raw.reason, memo: raw.memo }),
    raw,
  }
}
