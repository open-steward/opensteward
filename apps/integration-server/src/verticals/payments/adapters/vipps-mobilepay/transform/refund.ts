/**
 * Maps a Vipps MobilePay ePayment **refund** onto the canonical `Refund`.
 *
 * Vipps has no standalone refund resource and no `GET /refunds/{id}` —
 * a refund is issued with `POST /epayment/v1/payments/{reference}/refund` and
 * the response echoes the updated payment (with a fresh `pspReference` for the
 * refund operation and the new `aggregate.refundedAmount`). We therefore build
 * the canonical refund from the response combined with the request context
 * (the modification amount we asked to refund).
 *
 * Docs: https://developer.vippsmobilepay.com/api/epayment
 */
import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, type VippsAmount } from './shared'

export interface RawVippsRefundResponse {
  /** The payment reference the refund was issued against. */
  reference?: string
  /** Vipps id for the refund operation. */
  pspReference?: string
  state?: string
  aggregate?: { refundedAmount?: VippsAmount }
  [k: string]: unknown
}

/** Request-side context the adapter passes through to build the canonical refund. */
export interface VippsRefundContext {
  reference: string
  modificationAmount?: VippsAmount
}

export function transformRefund(
  raw: RawVippsRefundResponse,
  ctx: VippsRefundContext,
): Refund {
  const id = raw.pspReference ?? ''
  const amount = ctx.modificationAmount?.value ?? raw.aggregate?.refundedAmount?.value ?? 0
  const currency = pickCurrency(
    ctx.modificationAmount?.currency ?? raw.aggregate?.refundedAmount?.currency,
  )
  return {
    id: String(id),
    externalId: String(id),
    chargeId: String(raw.reference ?? ctx.reference ?? ''),
    amount,
    currency,
    // The refund endpoint returns synchronously once the refund is registered;
    // Vipps does not surface an intermediate pending state on the response.
    status: 'succeeded',
    gateway: 'vipps-mobilepay',
    metadata: strMap({ pspReference: raw.pspReference, state: raw.state }),
    raw,
  }
}
