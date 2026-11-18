/**
 * Transform Restaurant365 OData `Transaction` (type="Inventory Count" or
 * "Inventory Adjustment") + its `TransactionDetail` rows -> canonical StockAdjustment.
 *
 * R365 groups inventory variance lines under a parent Transaction. The adapter
 * treats each Transaction as one StockAdjustment with the TransactionDetail
 * rows as its lines.
 *
 * OData fields used:
 * Transaction:
 *   transactionId     Guid
 *   transactionNumber String
 *   name              String
 *   type              String   — "Inventory Count" | "Inventory Adjustment"
 *   locationId        Guid
 *   date              DateTimeOffset
 *   createdBy         String
 *   isApproved        Boolean
 *
 * TransactionDetail (lines):
 *   transactionDetailId  Guid
 *   itemId               Guid   — product
 *   adjustment           Decimal — delta quantity
 *   quantity             Decimal — counted quantity
 *   comment              String
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawR365TransactionLine {
  transactionDetailId?: string
  itemId?: string
  adjustment?: number
  quantity?: number
  comment?: string
  [key: string]: unknown
}

export interface RawR365AdjustmentTransaction {
  transactionId: string
  transactionNumber?: string
  name?: string
  type?: string
  locationId?: string
  date?: string
  createdBy?: string
  isApproved?: boolean
  lines?: RawR365TransactionLine[]
  [key: string]: unknown
}

function mapReason(type: string | undefined): StockAdjustmentReason {
  const t = (type ?? '').toLowerCase()
  if (t.includes('count')) return 'cycle_count'
  if (t.includes('damage')) return 'damage'
  if (t.includes('expir') || t.includes('waste')) return 'expiration'
  if (t.includes('correct') || t.includes('adjust')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawR365AdjustmentTransaction): StockAdjustment {
  return {
    id: raw.transactionId,
    externalId: raw.transactionId,
    locationId: raw.locationId ?? '',
    reason: mapReason(raw.type),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.itemId ?? '',
      deltaQuantity: l.adjustment ?? 0,
      countedQuantity: l.quantity,
      notes: pickStr(l.comment),
    })),
    adjustedAt: toIso(raw.date) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.createdBy),
    platform: 'restaurant365',
    metadata: strMap({
      transactionNumber: raw.transactionNumber,
      name: raw.name,
      type: raw.type,
      isApproved: raw.isApproved !== undefined ? String(raw.isApproved) : undefined,
    }),
    raw,
  }
}
