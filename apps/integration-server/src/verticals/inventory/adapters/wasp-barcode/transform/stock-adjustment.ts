/**
 * Transform Wasp InventoryCloud adjust transaction → canonical StockAdjustment.
 *
 * InventoryCloud adjust transaction fields (from transactions/item/adjust
 * and transactions/grid-query/transaction-history with type=adjust):
 *   TransactionId   — unique transaction identifier (string)
 *   ItemNumber      — item being adjusted
 *   LocationCode    — location where adjustment occurred
 *   SiteName        — site/warehouse
 *   Quantity        — delta quantity (positive = add, negative = remove)
 *   Reason          — free-text or coded reason for adjustment
 *   TransactionDate — when the adjustment occurred
 *   UserName        — who performed the adjustment
 *   Notes           — free-text notes
 *
 * InventoryCloud adjust reasons use up/down split:
 *   adjustUp/reasons  — positive adjustments (found, received extra, etc.)
 *   adjustDown/reasons — negative adjustments (lost, damaged, expired, etc.)
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawWaspBarcodeStockAdjustment {
  TransactionId?: string | number
  ItemNumber?: string
  LocationCode?: string
  SiteName?: string
  Quantity?: number | string
  Reason?: string
  TransactionDate?: string
  UserName?: string
  Notes?: string
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('audit') || r.includes('reconcil')) return 'cycle_count'
  if (r.includes('damage') || r.includes('broken') || r.includes('defect')) return 'damage'
  if (r.includes('theft') || r.includes('stolen') || r.includes('shrink')) return 'theft'
  if (r.includes('lost') || r.includes('missing')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir') || r.includes('obsolete')) return 'expiration'
  if (r.includes('correct') || r.includes('error')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawWaspBarcodeStockAdjustment): StockAdjustment {
  const id = String(raw.TransactionId ?? '')
  const locationId = pickStr(raw.LocationCode) ?? pickStr(raw.SiteName) ?? ''
  const delta = pickNum(raw.Quantity) ?? 0

  return {
    id,
    externalId: id,
    locationId,
    reason: mapReason(raw.Reason),
    lines: [
      {
        productId: pickStr(raw.ItemNumber) ?? '',
        deltaQuantity: delta,
        countedQuantity: undefined,
        notes: pickStr(raw.Notes),
      },
    ],
    adjustedAt: toIso(raw.TransactionDate) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.UserName),
    platform: 'wasp-barcode',
    metadata: strMap({
      rawReason: raw.Reason,
      siteName: raw.SiteName,
    }),
    raw,
  }
}
