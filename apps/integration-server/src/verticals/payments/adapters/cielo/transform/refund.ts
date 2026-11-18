import type { Refund } from '../../../schema/refund'
import { isoOrUndefined, pickCurrency, strMap } from './shared'

/**
 * Cielo has no first-class "refund" object. A refund (full) or partial refund
 * is a *void* — `PUT /1/sales/{PaymentId}/void` — and the response is a thin
 * Payment-shaped body echoing the resulting status. The void body does NOT
 * repeat the original amount/currency, so the adapter passes the requested
 * `amount`/`currency` and the source `chargeId` (PaymentId) in as context.
 */
export interface RawCieloVoid {
  Status?: number
  ReturnCode?: string
  ReturnMessage?: string
  Tid?: string
  ProofOfSale?: string
  AuthorizationCode?: string
  ReasonCode?: number
  ReasonMessage?: string
  Links?: unknown
  [k: string]: unknown
}

export interface CieloRefundContext {
  /** Source PaymentId the void was issued against. */
  chargeId: string
  /** Amount voided, in centavos. */
  amount: number
  currency?: string
}

/**
 * Void result status: 2 = PaymentConfirmed (capture still standing — void
 * not applied), 10 = Voided, 11 = Refunded. We treat 10/11 as a succeeded
 * refund and anything else as pending; a denied void surfaces as failed.
 */
export function transformRefund(raw: RawCieloVoid, ctx: CieloRefundContext): Refund {
  const status = raw.Status
  const refundStatus =
    status === 10 || status === 11
      ? 'succeeded'
      : status === 3 || status === 13
        ? 'failed'
        : 'pending'
  return {
    id: ctx.chargeId,
    externalId: ctx.chargeId,
    chargeId: ctx.chargeId,
    amount: ctx.amount,
    currency: pickCurrency(ctx.currency),
    status: refundStatus,
    failureReason: refundStatus === 'failed' ? raw.ReturnMessage : undefined,
    gateway: 'cielo',
    metadata: strMap({
      Tid: raw.Tid,
      ProofOfSale: raw.ProofOfSale,
      AuthorizationCode: raw.AuthorizationCode,
      ReturnCode: raw.ReturnCode,
      ReturnMessage: raw.ReturnMessage,
      ReasonCode: raw.ReasonCode,
      ReasonMessage: raw.ReasonMessage,
    }),
    createdAt: isoOrUndefined(new Date().toISOString()),
    updatedAt: isoOrUndefined(new Date().toISOString()),
    raw,
  }
}
