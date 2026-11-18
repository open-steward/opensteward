import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Juspay refund object. Refunds are returned inside the `refunds[]` array on
 * the Order Status / Create Refund response — there is no standalone
 * `GET /refunds/{id}` endpoint. `unique_request_id` is the merchant-assigned
 * idempotency key; `ref` is the payment gateway's refund id. The canonical
 * `chargeId` is the Juspay order id (refunds are scoped to an order), which we
 * thread in from the caller since the refund object itself does not echo it.
 */
export interface RawJuspayRefund {
  unique_request_id?: string
  ref?: string
  amount?: number
  currency?: string
  status?: string
  refund_type?: string
  refund_source?: string
  sent_to_gateway?: boolean
  initiated_by?: string
  error_code?: string | null
  error_message?: string | null
  created?: string
  order_id?: string
  metadata?: Record<string, unknown> | null
  [k: string]: unknown
}

function mapStatus(raw: string): RefundStatus {
  switch (raw.toUpperCase()) {
    case 'SUCCESS':
      return 'succeeded'
    case 'PENDING':
    case 'MANUAL_REVIEW':
      return 'pending'
    case 'FAILURE':
    case 'FAILED':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawJuspayRefund): Refund {
  const id = String(raw.ref ?? raw.unique_request_id ?? '')
  return {
    id,
    externalId: id,
    chargeId: String(raw.order_id ?? ''),
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency),
    status: mapStatus(String(raw.status ?? '')),
    failureReason: raw.error_message ?? undefined,
    gateway: 'juspay',
    metadata: strMap({
      unique_request_id: raw.unique_request_id,
      refund_type: raw.refund_type,
      refund_source: raw.refund_source,
      initiated_by: raw.initiated_by,
      error_code: raw.error_code,
      ...raw.metadata,
    }),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.created),
    raw,
  }
}
