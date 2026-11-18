/**
 * Deck Commerce does not expose a stock adjustment REST endpoint in its OMS API.
 * Inventory adjustments are performed via the Inventory Center UI or via SFTP
 * full/delta inventory feed files.
 *
 * This transform handles any adjustment-like data that may appear in future
 * API responses. Field names follow the Deck Commerce naming convention.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawDeckCommerceStockAdjustment {
  AdjustmentID?: string
  WarehouseCode?: string
  AdjustmentReason?: string
  Status?: string
  Lines?: Array<{ SKU: string; DeltaQty: number; CountedQty?: number; Notes?: string }>
  AdjustmentDateUTC?: string
  AdjustedBy?: string
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

export function transformStockAdjustment(raw: RawDeckCommerceStockAdjustment): StockAdjustment {
  const id = pickStr(raw.AdjustmentID) ?? ''
  return {
    id,
    externalId: id,
    locationId: pickStr(raw.WarehouseCode) ?? '',
    reason: mapReason(raw.AdjustmentReason),
    lines: (raw.Lines ?? []).map((l) => ({
      productId: l.SKU,
      deltaQuantity: l.DeltaQty,
      countedQuantity: l.CountedQty,
      notes: l.Notes,
    })),
    adjustedAt: toIso(raw.AdjustmentDateUTC) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.AdjustedBy),
    platform: 'deck-commerce',
    metadata: strMap({ reason: raw.AdjustmentReason, status: raw.Status }),
    raw,
  }
}
