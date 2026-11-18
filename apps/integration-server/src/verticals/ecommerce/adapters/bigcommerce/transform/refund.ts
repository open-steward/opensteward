/**
 * BigCommerce Refund → canonical Refund.
 *
 * BigCommerce v3 refunds endpoint: `/v3/orders/{id}/payment_actions/refunds`.
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

export interface RawBigCommerceRefundItem {
  item_type?: string // 'PRODUCT' | 'SHIPPING' | 'HANDLING'
  item_id?: number | string
  quantity?: number
  amount?: number
  reason?: string
}

export interface RawBigCommerceRefundPayment {
  id?: number | string
  provider_id?: string
  amount?: number
  is_declined?: boolean
}

export interface RawBigCommerceRefund {
  id: number | string
  order_id: number | string
  reason?: string | null
  total_amount?: number
  items?: RawBigCommerceRefundItem[]
  payments?: RawBigCommerceRefundPayment[]
  created?: string
  [key: string]: unknown
}

function mapRefundLineItems(
  raw: RawBigCommerceRefundItem[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw
    .filter((item) => item.item_type === 'PRODUCT')
    .map((item) => ({
      lineItemId: String(item.item_id ?? ''),
      quantity: item.quantity ?? 1,
      amount:
        item.amount != null
          ? { amount: majorToMinor(item.amount, currency), currency }
          : undefined,
    }))
}

export function transformRefund(
  raw: RawBigCommerceRefund,
  currency: string = 'USD',
): Refund {
  const refundLineItems = mapRefundLineItems(raw.items, currency)
  const transactionIds = raw.payments
    ?.filter((p) => p.id != null)
    .map((p) => String(p.id))

  return {
    id: String(raw.id),
    orderId: String(raw.order_id),
    amount:
      raw.total_amount != null && raw.total_amount > 0
        ? { amount: majorToMinor(raw.total_amount, currency), currency }
        : undefined,
    note: raw.reason ?? undefined,
    refundLineItems,
    transactionIds: transactionIds && transactionIds.length > 0 ? transactionIds : undefined,
    createdAt: raw.created,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    reason: refund.note,
    items: refund.refundLineItems?.map((li) => ({
      item_type: 'PRODUCT',
      item_id: Number(li.lineItemId),
      quantity: li.quantity,
      // Canonical amount is integer minor units; BigCommerce expects a decimal major-unit value.
      amount: li.amount?.amount != null ? li.amount.amount / 100 : undefined,
    })),
  }
}
