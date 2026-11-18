import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, pickStr, strMap, toIsoDatetime, toMinorUnits } from './shared'

/**
 * Rapyd Refund object (subset). `id` starts with `refund_`; `amount` is a
 * decimal major-unit value; `status` is a capitalised word.
 * Docs: https://docs.rapyd.net/en/refund-364021.html
 */
export interface RawRapydRefund {
  id?: string
  payment?: string
  amount?: number | string
  currency?: string
  currency_code?: string
  status?: string
  reason?: string
  failure_reason?: string
  receipt_number?: string
  merchant_reference_id?: string
  created_at?: number
  updated_at?: number
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawRapydRefund): RefundStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'completed':
      return 'succeeded'
    case 'pending':
      return 'pending'
    case 'rejected':
    case 'error':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawRapydRefund): Refund {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    chargeId: pickStr(raw.payment) ?? '',
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency ?? raw.currency_code),
    status: mapStatus(raw),
    failureReason: pickStr(raw.failure_reason),
    receiptNumber: pickStr(raw.receipt_number),
    gateway: 'rapyd',
    metadata: strMap({
      ...raw.metadata,
      ...(raw.reason ? { reason: raw.reason } : {}),
      ...(raw.merchant_reference_id ? { merchant_reference_id: raw.merchant_reference_id } : {}),
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
