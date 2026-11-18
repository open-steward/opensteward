/**
 * VTEX Return (refund) → canonical Refund.
 *
 * VTEX handles returns through the Returns App API (also called VTEX Returns).
 * Return requests are accessible at:
 *   GET /api/rma/pub/return-requests
 *   GET /api/rma/pub/return-requests/{returnRequestId}
 *
 * Individual item-level amounts are in integer minor units (centavos/cents),
 * consistent with the rest of the Orders API.
 *
 * Docs: https://developers.vtex.com/docs/api-reference/return-app-api
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw VTEX shapes ──────────────────────────────────────────────────────────

export interface RawVtexReturnItem {
  /** The order item's unique id (same as RawVtexOrderItem.id). */
  orderItemIndex?: number | null
  localId?: string | null
  quantity: number
  /** Refund amount for this item in integer minor units. */
  unitMultiplier?: number | null
  type?: string | null
  sellerSku?: string | null
  [key: string]: unknown
}

export interface RawVtexReturnRequest {
  id: string
  orderId: string
  /** Total refund amount in integer minor units. */
  refundableAmount?: number | null
  /** Status string, e.g. "pendingVerification", "amountRefunded", "denied". */
  status?: string | null
  userComment?: string | null
  createdIn?: string | null
  lastChange?: string | null
  refundableAmountTotals?: Array<{
    id: string
    name: string
    /** Amount in integer minor units. */
    value: number
  }>
  items?: RawVtexReturnItem[]
  cultureInfoData?: { locale?: string; currencyCode?: string } | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

function mapRefundLineItems(
  items: RawVtexReturnItem[] | undefined,
  _currency: string,
): RefundLineItem[] | undefined {
  if (!items || items.length === 0) return undefined
  return items.map((item, index) => ({
    // VTEX return items don't carry a canonical line item id directly; use index.
    lineItemId: item.localId ?? String(index),
    quantity: item.quantity,
    amount: undefined, // Per-item amount not reliably available; use total from request.
  }))
}

export function transformRefund(raw: RawVtexReturnRequest, currency = 'BRL'): Refund {
  const cur = raw.cultureInfoData?.currencyCode ?? currency
  const totalAmount =
    raw.refundableAmount != null ? { amount: raw.refundableAmount, currency: cur } : undefined

  return {
    id: raw.id,
    orderId: raw.orderId,
    amount: totalAmount,
    reason: raw.userComment ?? undefined,
    restock: true, // VTEX returns typically restock items.
    refundLineItems: mapRefundLineItems(raw.items, cur),
    processedAt: toIsoDatetime(raw.lastChange ?? undefined) ?? undefined,
    createdAt: toIsoDatetime(raw.createdIn ?? undefined) ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    orderId: refund.orderId,
    userComment: refund.reason,
    items: refund.refundLineItems?.map((li, i) => ({
      orderItemIndex: i,
      quantity: li.quantity,
    })),
  }
}
