/**
 * Xentral ERP stock-adjustment transform.
 *
 * Xentral's public V1 REST API does not expose a stock-adjustment listing
 * endpoint. Inventory corrections are applied through the ERP UI (e.g. via
 * "Lagerkorrektur") and are not accessible via the REST API.
 * This file is a placeholder for future use. The adapter does NOT implement
 * listStockAdjustments / getStockAdjustment.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawXentralStockAdjustment {
  id: number | string
  warehouseId?: number | string
  reason?: string
  note?: string
  createdBy?: string
  createdAt?: string
  lines?: Array<{
    productId: number | string
    deltaQuantity: number
    countedQuantity?: number
    note?: string
  }>
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('inventur')) return 'cycle_count'
  if (r.includes('damage') || r.includes('defekt')) return 'damage'
  if (r.includes('theft') || r.includes('diebstahl')) return 'theft'
  if (r.includes('lost') || r.includes('verlust')) return 'lost'
  if (r.includes('found') || r.includes('gefunden')) return 'found'
  if (r.includes('expir') || r.includes('ablauf')) return 'expiration'
  if (r.includes('correct') || r.includes('korrektur')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawXentralStockAdjustment): StockAdjustment {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    locationId: raw.warehouseId != null ? String(raw.warehouseId) : '',
    reason: mapReason(raw.reason),
    lines: (raw.lines ?? []).map((l) => ({
      productId: String(l.productId),
      deltaQuantity: l.deltaQuantity,
      countedQuantity: l.countedQuantity,
      notes: pickStr(l.note),
    })),
    adjustedAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.createdBy),
    platform: 'xentral',
    metadata: strMap({ rawReason: raw.reason, note: raw.note }),
    raw,
  }
}
