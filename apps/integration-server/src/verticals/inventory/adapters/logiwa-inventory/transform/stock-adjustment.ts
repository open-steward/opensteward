import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawLogiwaInventoryStockAdjustment {
  ID: string
  Location?: string
  Reason?: string
  Status?: string
  Lines?: Array<{ ProductID: string; Delta: number; Counted?: number; Notes?: string }>
  Date?: string
  UserName?: string
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

export function transformStockAdjustment(raw: RawLogiwaInventoryStockAdjustment): StockAdjustment {
  return {
    id: raw.ID,
    externalId: raw.ID,
    locationId: raw.Location ?? '',
    reason: mapReason(raw.Reason),
    lines: (raw.Lines ?? []).map((l) => ({
      productId: l.ProductID,
      deltaQuantity: l.Delta,
      countedQuantity: l.Counted,
      notes: l.Notes,
    })),
    adjustedAt: toIso(raw.Date) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.UserName),
    platform: 'logiwa-inventory',
    metadata: strMap({ rawReason: raw.Reason, status: raw.Status }),
    raw,
  }
}
