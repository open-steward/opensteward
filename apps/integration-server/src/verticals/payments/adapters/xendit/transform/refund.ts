import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundReason, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorAmount } from './shared'

/**
 * Xendit Refund object (Refunds API — part of the Payments / Payment Requests
 * product). A refund references the original payment via `payment_request_id`
 * (and/or `payment_id`).
 *
 * https://docs.xendit.co/apidocs/refund-payment-request
 */
export interface RawXenditRefund {
  id?: string
  payment_request_id?: string | null
  payment_id?: string | null
  invoice_id?: string | null
  reference_id?: string | null
  amount?: number
  currency?: string
  channel_code?: string | null
  status?: 'SUCCEEDED' | 'FAILED' | 'PENDING' | 'CANCELLED' | string
  reason?: 'FRAUDULENT' | 'DUPLICATE' | 'REQUESTED_BY_CUSTOMER' | 'CANCELLATION' | 'OTHERS' | string
  failure_code?: string | null
  refund_fee_amount?: number | null
  metadata?: Record<string, unknown> | null
  created?: string | null
  updated?: string | null
  [k: string]: unknown
}

function mapStatus(raw: RawXenditRefund): RefundStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'SUCCEEDED':
      return 'succeeded'
    case 'FAILED':
      return 'failed'
    case 'CANCELLED':
      return 'cancelled'
    case 'PENDING':
      return 'pending'
    default:
      return 'pending'
  }
}

function mapReason(raw: RawXenditRefund): RefundReason | undefined {
  switch ((raw.reason ?? '').toUpperCase()) {
    case 'FRAUDULENT':
      return 'fraudulent'
    case 'DUPLICATE':
      return 'duplicate'
    case 'REQUESTED_BY_CUSTOMER':
      return 'requested_by_customer'
    case 'CANCELLATION':
    case 'OTHERS':
      return 'other'
    default:
      return undefined
  }
}

export function transformRefund(raw: RawXenditRefund): Refund {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? raw.reference_id ?? ''),
    chargeId: String(raw.payment_request_id ?? raw.payment_id ?? raw.invoice_id ?? ''),
    amount: toMinorAmount(raw.amount),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    reason: mapReason(raw),
    failureReason: raw.failure_code ?? undefined,
    gateway: 'xendit',
    metadata: strMap({
      ...(raw.metadata ?? {}),
      channel_code: raw.channel_code,
      refund_fee_amount: raw.refund_fee_amount,
    }),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.updated),
    raw,
  }
}
