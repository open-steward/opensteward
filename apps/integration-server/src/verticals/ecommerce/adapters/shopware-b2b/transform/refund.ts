/**
 * Shopware B2B Suite Refund → canonical Refund.
 *
 * Identical to base Shopware 6 — B2B Suite does not modify refunds.
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'

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
        ? { amount: p.amount.totalPrice, currency }
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
    amount: amount != null ? { amount, currency } : undefined,
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
