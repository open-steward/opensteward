/**
 * Shopware 6 Order Transaction Capture Refund → canonical Refund.
 *
 * Shopware 6 refunds live under
 * `/api/order-transaction-capture-refund`. Each refund is linked to
 * an order transaction capture and carries:
 *  - `amount.totalPrice` — refund total.
 *  - `positions[]` — refund line item details.
 *  - `stateMachineState.technicalName` — refund state.
 *
 * For simpler installations, refunds may also be driven by the
 * order-level state machine transition to "refunded". We represent
 * the capture-refund entities here.
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawShopwareRefundPosition {
  id?: string
  orderLineItemId?: string
  quantity?: number
  amount?: { totalPrice?: number }
  reason?: string | null
  [key: string]: unknown
}

export interface RawShopwareRefund {
  id: string
  captureId?: string
  /** We set this from the parent transaction's orderId during transform. */
  orderId?: string
  amount?: { totalPrice?: number }
  stateMachineState?: { technicalName?: string; name?: string }
  positions?: RawShopwareRefundPosition[]
  reason?: string | null
  createdAt?: string
  updatedAt?: string | null
  [key: string]: unknown
}

function mapLineItems(
  raw: RawShopwareRefundPosition[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((p) => ({
    lineItemId: p.orderLineItemId ?? p.id ?? '',
    quantity: p.quantity ?? 0,
    amount:
      p.amount?.totalPrice != null
        ? { amount: majorToMinor(p.amount.totalPrice, currency), currency }
        : undefined,
  }))
}

export function transformRefund(
  raw: RawShopwareRefund,
  currency: string = 'EUR',
): Refund {
  const amount = raw.amount?.totalPrice
  return {
    id: raw.id,
    orderId: raw.orderId ?? '',
    amount: amount != null ? { amount: majorToMinor(amount, currency), currency } : undefined,
    reason: raw.reason ?? undefined,
    restock: false,
    refundLineItems: mapLineItems(raw.positions, currency),
    processedAt: toIsoDatetime(raw.createdAt),
    createdAt: toIsoDatetime(raw.createdAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformRefund(
  refund: Partial<Refund>,
): Record<string, unknown> {
  return {
    amount: refund.amount ? { totalPrice: refund.amount.amount } : undefined,
    positions: refund.refundLineItems?.map((li) => ({
      orderLineItemId: li.lineItemId,
      quantity: li.quantity,
      amount: li.amount ? { totalPrice: li.amount.amount } : undefined,
    })),
  }
}
