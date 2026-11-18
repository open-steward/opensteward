/**
 * Sezzle refunds are taken against an **order** (`POST /v2/order/{uuid}/refund`
 * with `{ amount_in_cents, currency }`). The documented response is minimal —
 * just the new refund's `uuid`. There is no standalone refund list/get
 * endpoint, so the adapter only implements `createRefund`.
 *
 * Because the response omits the amount/currency, the transform takes them
 * from the request the caller made (the order id becomes `chargeId`). It
 * never throws — a missing uuid yields an empty id rather than an error.
 *
 * Docs: https://docs.sezzle.com/docs/api/core/orders/postv2refundbyorder
 */
import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap } from './shared'

export interface RawSezzleRefundResponse {
  uuid?: string
  [k: string]: unknown
}

export interface SezzleRefundContext {
  /** The Sezzle order uuid the refund was taken against. */
  orderId: string
  amountInCents?: number
  currency?: string
  reason?: string
}

export function transformRefund(
  raw: RawSezzleRefundResponse,
  ctx: SezzleRefundContext,
): Refund {
  return {
    id: String(raw.uuid ?? ''),
    externalId: String(raw.uuid ?? ''),
    chargeId: ctx.orderId,
    amount: ctx.amountInCents ?? 0,
    currency: pickCurrency(ctx.currency),
    // Sezzle returns the refund synchronously on a 200, so it is settled.
    status: raw.uuid ? 'succeeded' : 'pending',
    gateway: 'sezzle',
    metadata: strMap({ reason: ctx.reason }),
    raw,
  }
}
