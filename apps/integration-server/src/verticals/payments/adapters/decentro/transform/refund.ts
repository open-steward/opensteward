import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Decentro's UPI refund response (POST /v2/payments/upi/refund). The refund's
 * own id is the top-level `decentroTxnId`; the original charge it refunds is the
 * `transaction_id` sent on the request, which the response does NOT echo, so the
 * caller threads it back in via `context`.
 */
export interface RawDecentroRefundData {
  transactionId?: string
  transactionStatus?: string
  transactionStatusDescription?: string
  bankReferenceNumber?: string
  npciTransactionId?: string
  [k: string]: unknown
}

export interface RawDecentroRefund {
  decentroTxnId?: string
  status?: string
  responseCode?: string
  message?: string
  data?: RawDecentroRefundData
  [k: string]: unknown
}

/** Caller-supplied context the refund response itself does not carry back. */
export interface RefundContext {
  chargeId?: string
  amount?: number | string
}

function mapStatus(raw: RawDecentroRefund): RefundStatus {
  const s = String(raw.data?.transactionStatus ?? raw.status ?? '').toUpperCase()
  switch (s) {
    case 'SUCCESS':
      return 'succeeded'
    case 'PENDING':
      return 'pending'
    case 'FAILURE':
    case 'FAILED':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawDecentroRefund, context: RefundContext = {}): Refund {
  const id = String(raw.decentroTxnId ?? raw.data?.transactionId ?? '')
  return {
    id,
    externalId: id,
    chargeId: String(context.chargeId ?? ''),
    amount: toMinorUnits(context.amount) ?? 0,
    currency: pickCurrency(),
    status: mapStatus(raw),
    failureReason: raw.data?.transactionStatusDescription ?? raw.message ?? undefined,
    gateway: 'decentro',
    metadata: strMap({
      transaction_status: raw.data?.transactionStatus,
      bank_reference_number: raw.data?.bankReferenceNumber,
      npci_transaction_id: raw.data?.npciTransactionId,
      response_code: raw.responseCode,
    }),
    raw,
  }
}
