/**
 * Transform a Datapel Breeze stock adjustment record into the canonical
 * StockAdjustment shape.
 *
 * Datapel surfaces adjustments via the Inventory Events endpoint or a
 * dedicated adjustment list. The structure mirrors inventory event records
 * with an adjustment reason and per-line delta quantities.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawDatapelStockAdjustment {
  adjustmentid?: number | string
  locationid?: number | string
  locationname?: string
  reason?: string
  status?: string
  adjustdate?: string
  date?: string
  username?: string
  userid?: number | string
  lines?: Array<{
    basestockid?: number | string
    itemcode?: string
    delta?: number | string
    adjustqty?: number | string
    countedqty?: number | string
    notes?: string
  }>
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('stocktake')) return 'cycle_count'
  if (r.includes('damage') || r.includes('damaged')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct') || r.includes('error')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawDatapelStockAdjustment): StockAdjustment {
  const id = String(raw.adjustmentid ?? '')
  return {
    id,
    externalId: id,
    locationId: String(raw.locationid ?? ''),
    reason: mapReason(raw.reason),
    lines: (raw.lines ?? []).map((l) => ({
      productId: String(l.basestockid ?? ''),
      deltaQuantity: pickNum(l.delta) ?? pickNum(l.adjustqty) ?? 0,
      countedQuantity: pickNum(l.countedqty),
      notes: pickStr(l.notes),
    })),
    adjustedAt: toIso(raw.adjustdate) ?? toIso(raw.date) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.username),
    platform: 'datapel',
    metadata: strMap({
      rawReason: raw.reason,
      status: raw.status,
      locationname: raw.locationname,
      userid: raw.userid,
    }),
    raw,
  }
}
