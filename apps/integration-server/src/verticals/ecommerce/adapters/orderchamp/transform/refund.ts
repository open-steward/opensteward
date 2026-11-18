/**
 * Orderchamp `orderProductRefundCreate` transform — create only.
 *
 * Confirmed to exist in Orderchamp's own published schema
 * (`orderProductRefundCreate` mutation, `OrderProductRefundCreateInput`,
 * `OrderProductRefundCreateProductInput`, `OrderProductRefundReason` types —
 * see https://developers.orderchamp.com/getting-started's type index). No
 * refund QUERY exists anywhere in that same index, so this is create-only;
 * `OrderProductRefundReason`'s allowed enum values are not confirmed from
 * public docs, so `reason` is deliberately not sent rather than guessed
 * (an invalid enum literal would fail the whole mutation).
 *
 * Docs: https://developers.orderchamp.com/getting-started
 */
import type { Refund } from '../../../schema/refund'

export interface OrderchampRefundCreateInput {
  orderId: string
  products: Array<{ orderProductId: string; quantity: number }>
}

export function untransformRefund(data: Partial<Refund>): OrderchampRefundCreateInput {
  if (!data.orderId) throw new Error('createRefund requires orderId (the Orderchamp Order id)')
  const lines = data.refundLineItems ?? []
  if (lines.length === 0) {
    throw new Error('createRefund requires at least one refundLineItems entry (OrderProduct id + quantity).')
  }
  return {
    orderId: data.orderId,
    products: lines.map((li) => ({ orderProductId: li.lineItemId, quantity: li.quantity })),
  }
}

export interface RawOrderchampRefund {
  id: string
}

/** `orderProductRefundCreate`'s response is not confirmed to echo the order id — combine with the request. */
export function transformRefund(raw: RawOrderchampRefund, request: OrderchampRefundCreateInput): Refund {
  return {
    id: String(raw.id),
    orderId: request.orderId,
    refundLineItems: request.products.map((p) => ({ lineItemId: p.orderProductId, quantity: p.quantity })),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
