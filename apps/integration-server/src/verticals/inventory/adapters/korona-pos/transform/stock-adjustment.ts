import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * KORONA.cloud API v3 StockAdjustment shape.
 * Returned by GET /accounts/{accountId}/stockAdjustments
 * and GET /accounts/{accountId}/stockAdjustments/{stockAdjustmentId}.
 *
 * Items are fetched separately via GET /stockAdjustments/{id}/items.
 * Each item has amount (delta quantity), product (ModelReference), and
 * reason ({ type, comment }) where type is one of:
 *   BREAKAGE | EXPIRED_SHELF_LIFE | OTHER | THEFT | PERSONAL_USE | TRANSFER
 *
 * Status enum: "BOOKED" | "IN_PROGRESS"
 */
export interface RawKoronaStockAdjustmentItem {
  amount?: number
  product?: { id?: string; number?: string }
  reason?: { type?: string; comment?: string }
  revision?: number
}

export interface RawKoronaStockAdjustment {
  id: string
  number?: string
  active?: boolean
  status?: string
  warehouse?: { id?: string; number?: string }
  reason?: string
  receiptNumber?: string
  bookingTime?: string
  finishTime?: string
  bookingUser?: { id?: string; number?: string }
  bookingApiUser?: { id?: string; number?: string }
  production?: boolean
  externalId?: string
  items?: RawKoronaStockAdjustmentItem[]
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('inventory')) return 'cycle_count'
  if (r.includes('break') || r.includes('damage')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct')) return 'correction'
  return 'other'
}

function mapItemReason(type: string | undefined): StockAdjustmentReason {
  switch ((type ?? '').toUpperCase()) {
    case 'BREAKAGE':
      return 'damage'
    case 'EXPIRED_SHELF_LIFE':
      return 'expiration'
    case 'THEFT':
      return 'theft'
    case 'TRANSFER':
      return 'correction'
    case 'PERSONAL_USE':
    case 'OTHER':
    default:
      return 'other'
  }
}

export function transformStockAdjustment(raw: RawKoronaStockAdjustment): StockAdjustment {
  const lines = (raw.items ?? []).map((item) => {
    const delta = typeof item.amount === 'number' ? item.amount : 0
    return {
      productId: item.product?.id ?? '',
      deltaQuantity: delta,
      countedQuantity: undefined,
      notes: pickStr(item.reason?.comment),
    }
  })

  // Derive overall reason: prefer the document-level reason string; fall back
  // to the first item's reason type if available.
  const docReason = pickStr(raw.reason)
  const firstItemReasonType = raw.items?.[0]?.reason?.type
  const reason: StockAdjustmentReason = docReason
    ? mapReason(docReason)
    : firstItemReasonType
      ? mapItemReason(firstItemReasonType)
      : 'other'

  const adjustedAt =
    toIso(raw.bookingTime ?? raw.finishTime) ?? new Date(0).toISOString()

  return {
    id: raw.id,
    externalId: raw.id,
    locationId: raw.warehouse?.id ?? '',
    reason,
    lines,
    adjustedAt,
    adjustedBy: pickStr(raw.bookingUser?.number ?? raw.bookingApiUser?.number),
    platform: 'korona-pos',
    metadata: strMap({
      number: raw.number,
      status: raw.status,
      reason: raw.reason,
      receiptNumber: raw.receiptNumber,
      warehouseNumber: raw.warehouse?.number,
    }),
    raw,
  }
}
