import type { Refund, RefundStatus } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { pickAmount, pickCurrency, pickStr, strMap } from './shared'

/**
 * APEXX represents a refund as a transaction with `transaction_type: 'REFUND'`.
 * `POST /refund/{id}` returns the refund transaction; its `original_transaction`
 * (or the captured-transaction id passed in) is the charge it reverses.
 */
export interface RawApexxRefund {
  _id?: string
  transaction_status?: string
  status?: string
  transaction_type?: string
  amount?: number | string
  refund_amount?: number | string
  currency?: string
  original_transaction?: string
  original_transaction_id?: string
  reason_code?: string | number
  reason_message?: string
  created?: string
  created_at?: string
  updated?: string
  last_status_update?: string
  [k: string]: unknown
}

function mapStatus(raw: RawApexxRefund): RefundStatus {
  switch ((raw.transaction_status ?? raw.status ?? '').toString().toUpperCase()) {
    case 'REFUNDED':
    case 'CAPTURED':
    case 'SETTLED':
    case 'COMPLETED':
      return 'succeeded'
    case 'CANCELLED':
    case 'CANCELED':
    case 'VOIDED':
      return 'cancelled'
    case 'DECLINED':
    case 'FAILED':
    case 'ERROR':
      return 'failed'
    default:
      return 'pending'
  }
}

/**
 * @param chargeId Fallback charge id (the transaction the refund was issued
 *   against) when the payload doesn't echo `original_transaction`.
 */
export function transformRefund(raw: RawApexxRefund, chargeId?: string): Refund {
  const id = pickStr(raw._id) ?? ''
  const status = mapStatus(raw)
  return {
    id,
    externalId: id,
    chargeId:
      pickStr(raw.original_transaction) ?? pickStr(raw.original_transaction_id) ?? chargeId ?? '',
    amount: pickAmount(raw.refund_amount ?? raw.amount) ?? 0,
    currency: pickCurrency(raw.currency),
    status,
    failureReason: status === 'failed' ? pickStr(raw.reason_message) : undefined,
    gateway: 'apexx',
    metadata: strMap({
      transaction_type: raw.transaction_type,
      reason_code: raw.reason_code,
      reason_message: raw.reason_message,
    }),
    createdAt: toIsoDatetime(raw.created ?? raw.created_at),
    updatedAt: toIsoDatetime(raw.updated ?? raw.last_status_update),
    raw,
  }
}
