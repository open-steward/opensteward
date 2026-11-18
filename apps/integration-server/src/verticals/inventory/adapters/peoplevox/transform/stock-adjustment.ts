/**
 * Transform a Peoplevox item-movement row representing a stock adjustment.
 *
 * Peoplevox records stock adjustments within the "Item movement history" report.
 * Movements with a Register_Reason (or where From/To is a virtual adjustment
 * location) are treated as adjustments.
 *
 * Template: "Item movement history"
 * Key fields: History_Id, Item_code, Date_timestamp, User, Site_reference,
 *   Quantity (positive = stock in / negative = stock out), Register_Reason,
 *   Comments, From, To
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawPeoplevoxStockAdjustment {
  History_Id?: string
  Item_code?: string
  Item_name?: string
  Date_timestamp?: string
  User?: string
  From?: string
  To?: string
  Quantity?: string
  Comments?: string
  Site_reference?: string
  Register_Reason?: string
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('stocktake') || r.includes('cycle')) return 'cycle_count'
  if (r.includes('damage') || r.includes('damaged')) return 'damage'
  if (r.includes('theft') || r.includes('stolen')) return 'theft'
  if (r.includes('lost')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawPeoplevoxStockAdjustment): StockAdjustment {
  const id = pickStr(raw.History_Id) ?? `${raw.Item_code ?? ''}:${raw.Date_timestamp ?? ''}`
  const qty = pickNum(raw.Quantity) ?? 0

  return {
    id,
    externalId: id,
    locationId: pickStr(raw.Site_reference) ?? pickStr(raw.From) ?? pickStr(raw.To) ?? '',
    reason: mapReason(raw.Register_Reason),
    lines: raw.Item_code ? [{
      productId: raw.Item_code,
      deltaQuantity: qty,
      countedQuantity: undefined,
      notes: pickStr(raw.Comments),
    }] : [],
    adjustedAt: toIso(raw.Date_timestamp) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.User),
    platform: 'peoplevox',
    metadata: strMap({
      registerReason: raw.Register_Reason,
      from: raw.From,
      to: raw.To,
    }),
    raw,
  }
}
