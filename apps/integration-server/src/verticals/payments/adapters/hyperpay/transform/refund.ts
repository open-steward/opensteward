/**
 * Maps a HyperPay (OPPWA) **refund** onto the canonical `Refund`.
 *
 * A HyperPay refund (RF) or reversal (RV) is itself a payment object, created by
 * `POST /v1/payments/{originalPaymentId}` with `paymentType=RF|RV`. Its own `id`
 * is the refund's identifier; the original payment it references is the
 * canonical `chargeId`. The original id is not always echoed in the response
 * body, so the adapter threads it in via `referencedId`.
 *
 * Money arrives as a decimal string (`"92.00"`) which we convert to integer
 * minor units for the canonical schema.
 *
 * Docs: https://hyperpay.docs.oppwa.com/reference/parameters
 */
import type { Refund, RefundStatus } from '../../../schema/refund'
import {
  classifyResult,
  pickCurrency,
  strMap,
  toIsoDatetime,
  toMinorUnits,
  type HyperpayResult,
} from './shared'

export interface RawHyperpayRefund {
  id?: string
  /** Original payment this refund/reversal references (threaded in by the adapter). */
  referencedId?: string
  paymentType?: string
  amount?: string
  currency?: string
  descriptor?: string
  result?: HyperpayResult
  timestamp?: string
  [k: string]: unknown
}

function mapStatus(raw: RawHyperpayRefund): RefundStatus {
  switch (classifyResult(raw.result?.code)) {
    case 'success':
      return 'succeeded'
    case 'pending':
      return 'pending'
    default:
      return 'failed'
  }
}

export function transformRefund(raw: RawHyperpayRefund): Refund {
  const id = raw.id ?? ''
  const rejected = classifyResult(raw.result?.code) === 'rejected'
  return {
    id: String(id),
    externalId: String(id),
    chargeId: String(raw.referencedId ?? ''),
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    failureReason: rejected ? raw.result?.description : undefined,
    gateway: 'hyperpay',
    metadata: strMap({
      paymentType: raw.paymentType,
      resultCode: raw.result?.code,
      resultDescription: raw.result?.description,
      descriptor: raw.descriptor,
    }),
    createdAt: toIsoDatetime(raw.timestamp),
    updatedAt: toIsoDatetime(raw.timestamp),
    raw,
  }
}
