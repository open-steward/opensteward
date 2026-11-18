/**
 * Oracle WMS Cloud — inventory_adjustment_hdr entity → StockAdjustment
 *
 * lgfapi endpoint: GET /wms/lgfapi/v10/entity/inventory_adjustment_hdr/
 *
 * WMS Cloud supports cycle counts and manual inventory adjustments.
 * Each adjustment header groups one or more line items.
 *
 * Key fields (header):
 *   inv_adj_hdr_id        — internal integer PK
 *   location_id           — FK to location where adjustment occurred
 *   adj_reason_code       — adjustment reason code (e.g. "CYCLE_COUNT", "DAMAGE")
 *   adj_reason            — human-readable reason description
 *   status                — "Open", "Completed", "Cancelled"
 *   adj_date              — date/time of adjustment
 *   created_by            — user who created the adjustment
 *   company_id            — tenant FK
 *
 * Line item fields (inventory_adjustment_dtl_set):
 *   inv_adj_dtl_id        — line PK
 *   item_id               — FK to item
 *   adj_qty               — delta quantity (positive = added, negative = removed)
 *   counted_qty           — physical count quantity (if from cycle count)
 *   notes                 — free-text notes
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawOracleWmsAdjLine {
  inv_adj_dtl_id?: number | string
  item_id?: number | string
  adj_qty?: number | string
  counted_qty?: number | string
  notes?: string
  [key: string]: unknown
}

export interface RawOracleWmsInventoryAdjustmentHdr {
  inv_adj_hdr_id: number | string
  location_id?: number | string
  adj_reason_code?: string
  adj_reason?: string
  status?: string
  adj_date?: string
  created_by?: string
  company_id?: number | string
  inventory_adjustment_dtl_set?: RawOracleWmsAdjLine[]
  [key: string]: unknown
}

function mapReason(code: unknown, desc: unknown): StockAdjustmentReason {
  const r = ((typeof code === 'string' ? code : '') + ' ' + (typeof desc === 'string' ? desc : '')).toLowerCase()
  if (r.includes('cycle') || r.includes('count')) return 'cycle_count'
  if (r.includes('damage') || r.includes('dmg')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost') || r.includes('missing')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct') || r.includes('adj')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawOracleWmsInventoryAdjustmentHdr): StockAdjustment {
  const id = String(raw.inv_adj_hdr_id)

  return {
    id,
    externalId: id,
    locationId: raw.location_id !== undefined ? String(raw.location_id) : '',
    reason: mapReason(raw.adj_reason_code, raw.adj_reason),
    lines: (raw.inventory_adjustment_dtl_set ?? []).map((l) => ({
      productId: l.item_id !== undefined ? String(l.item_id) : '',
      deltaQuantity: pickNum(l.adj_qty) ?? 0,
      countedQuantity: pickNum(l.counted_qty),
      notes: pickStr(l.notes),
    })),
    adjustedAt: toIso(raw.adj_date) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.created_by),
    platform: 'oracle-wms',
    metadata: strMap({
      adjReasonCode: raw.adj_reason_code,
      adjReason: raw.adj_reason,
      status: raw.status,
      companyId: raw.company_id,
    }),
    raw,
  }
}
