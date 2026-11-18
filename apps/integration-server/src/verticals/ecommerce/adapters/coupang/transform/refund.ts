/**
 * Coupang return/cancellation request → canonical Refund.
 *
 * Coupang handles returns and cancellations through the same "return request"
 * flow. These are queried via the Return/Cancellation Request List Query API:
 *
 *   GET /v2/providers/openapi/apis/api/v4/vendors/{vendorId}/returnRequests
 *
 * A single return request may contain multiple returned items, each with their
 * own quantity and reason codes.
 *
 * Docs: https://developers.coupangcorp.com/hc/en-us/articles/360033919613
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { DEFAULT_CURRENCY } from '../constants'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawCoupangReturnItem {
  /** Order item ID. */
  orderItemId?: number
  /** Returned quantity. */
  quantity?: number
  /** Unit return price (KRW). */
  returnPrice?: number
  /** Vendor item name. */
  vendorItemName?: string
  [key: string]: unknown
}

export interface RawCoupangReturnRequest {
  /** Coupang receipt ID (return request identifier). */
  receiptId?: number
  /** Associated order ID. */
  orderId?: number
  /** Human-readable order code. */
  orderCode?: string
  /** Return/cancellation request status. */
  receiptStatus?: string
  /**
   * Broad return reason category (e.g. "고객변심" / customer changed mind,
   * "상품불량" / defective product, etc.).
   */
  cancelReasonCategory1?: string
  /** Detailed reason sub-category. */
  cancelReasonCategory2?: string
  /** Request type: RETURN | CANCEL | EXCHANGE. */
  receiptType?: string
  /** Whether items should be restocked after return. */
  restock?: boolean
  /** Total return amount (KRW). */
  refundPrice?: number
  /** Returned items. */
  returnItems?: RawCoupangReturnItem[]
  /** ISO-8601 when the return request was submitted. */
  createdAt?: string
  /** ISO-8601 when the return request was last updated. */
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapReturnLineItem(item: RawCoupangReturnItem): RefundLineItem {
  return {
    lineItemId: item.orderItemId != null ? String(item.orderItemId) : '0',
    quantity: item.quantity ?? 1,
    amount:
      item.returnPrice != null
        ? { amount: item.returnPrice, currency: DEFAULT_CURRENCY }
        : undefined,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawCoupangReturnRequest): Refund {
  const lineItems = (raw.returnItems ?? []).map(mapReturnLineItem)

  const reason =
    [raw.cancelReasonCategory1, raw.cancelReasonCategory2]
      .filter(Boolean)
      .join(' / ') || undefined

  return {
    id: raw.receiptId != null ? String(raw.receiptId) : '0',
    orderId:
      raw.orderId != null
        ? String(raw.orderId)
        : (raw.orderCode ?? ''),
    amount:
      raw.refundPrice != null
        ? { amount: raw.refundPrice, currency: DEFAULT_CURRENCY }
        : undefined,
    reason,
    note: raw.receiptType,
    restock: raw.restock,
    refundLineItems: lineItems.length > 0 ? lineItems : undefined,
    processedAt: toIsoDatetime(raw.updatedAt),
    createdAt: toIsoDatetime(raw.createdAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
