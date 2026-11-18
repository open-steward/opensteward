/**
 * Netstock stock-adjustment transform.
 *
 * Netstock is a demand-forecasting / replenishment planning layer that sits
 * above an ERP. Stock adjustments (cycle counts, damage write-offs, etc.) are
 * executed and recorded entirely within the connected ERP (e.g. NetSuite, SAP,
 * Dynamics), NOT by Netstock itself. Netstock's public REST API exposes no
 * stock-adjustment listing or lookup endpoint.
 *
 * This file is a typed placeholder. The adapter does NOT implement
 * listStockAdjustments / getStockAdjustment.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawNetstockStockAdjustment {
  id: number | string
  warehouseId?: number | string
  reason?: string
  adjustedBy?: string
  adjustedAt?: string
  lines?: Array<{
    itemId: number | string
    deltaQty: number
    countedQty?: number
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

export function transformStockAdjustment(raw: RawNetstockStockAdjustment): StockAdjustment {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    locationId: raw.warehouseId != null ? String(raw.warehouseId) : '',
    reason: mapReason(raw.reason),
    lines: (raw.lines ?? []).map((l) => ({
      productId: String(l.itemId),
      deltaQuantity: l.deltaQty,
      countedQuantity: l.countedQty,
      notes: pickStr(l.notes),
    })),
    adjustedAt: toIso(raw.adjustedAt) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjustedBy),
    platform: 'netstock',
    metadata: strMap({ rawReason: raw.reason }),
    raw,
  }
}
