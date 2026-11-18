import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'
import type { RawFiservTransaction } from './charge'

/**
 * Commerce Hub returns a refund/cancel under the same envelope as a charge
 * (`gatewayResponse` + `paymentReceipt`). A refund has no standalone object to
 * list or fetch, so the only refund transform is response → canonical.
 *
 * `hint` carries the request-side values the response may omit — the
 * originating charge id and (for partial refunds) the refund amount/currency.
 */
export interface RefundHint {
  chargeId?: string
  amount?: number
  currency?: string
}

function mapStatus(raw: RawFiservTransaction): RefundStatus {
  const state = (raw.gatewayResponse?.transactionState ?? '').toUpperCase()
  switch (state) {
    case 'CAPTURED':
    case 'SETTLED':
    case 'COMPLETED':
    case 'APPROVED':
      return 'succeeded'
    case 'DECLINED':
    case 'FAILED':
      return 'failed'
    case 'VOIDED':
    case 'CANCELLED':
      return 'cancelled'
    default:
      break
  }
  const approval = (
    raw.paymentReceipt?.processorResponseDetails?.approvalStatus ?? ''
  ).toUpperCase()
  if (approval === 'APPROVED') return 'succeeded'
  if (approval === 'DECLINED') return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawFiservTransaction, hint: RefundHint = {}): Refund {
  const details = raw.gatewayResponse?.transactionProcessingDetails ?? {}
  const amt = raw.paymentReceipt?.approvedAmount ?? raw.approvedAmount ?? raw.amount ?? {}
  const currency = pickCurrency(amt.currency ?? hint.currency)
  const minor = amt.total != null ? toMinorUnits(amt.total, currency) : (hint.amount ?? 0)
  const proc = raw.paymentReceipt?.processorResponseDetails ?? {}

  return {
    id: String(details.transactionId ?? ''),
    externalId: String(details.transactionId ?? ''),
    chargeId: String(hint.chargeId ?? details.orderId ?? ''),
    amount: minor,
    currency,
    status: mapStatus(raw),
    failureReason:
      proc.approvalStatus === 'DECLINED'
        ? (proc.responseMessage ?? proc.hostResponseMessage)
        : undefined,
    gateway: 'fiserv',
    metadata: strMap({
      transactionType: raw.gatewayResponse?.transactionType,
      transactionState: raw.gatewayResponse?.transactionState,
      apiTraceId: details.apiTraceId,
      approvalStatus: proc.approvalStatus,
      approvalCode: proc.approvalCode,
    }),
    createdAt: toIsoDatetime(details.transactionTimestamp),
    raw,
  }
}
