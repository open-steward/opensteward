/**
 * Yoco API `Refund` (GET /v1/refunds/, GET /v1/refunds/{refund_id}) to a
 * canonical Refund. Field names and enums are from the `Refund` schema in
 * https://developer.yoco.com/openapi/yoco-api-reference.json.
 */
import type { Refund, RefundStatus } from '../../../schema/refund'
import { optionalString, readId, readMoney, stringFields, type RawYocoMoney } from './shared'

export interface RawYocoRefund {
  id: string
  payment_id: string
  total_amount: RawYocoMoney
  status?: string
  receipt_number?: string
  created_at?: string
  updated_at?: string | null
  [k: string]: unknown
}

/**
 * `RefundStatus`: `"enum":["approved","failed","pending","rejected"]`.
 * `rejected` is a refund that did not go through, as `failed` is.
 */
function mapStatus(s: unknown): RefundStatus {
  switch (s) {
    case 'approved':
      return 'succeeded'
    case 'pending':
      return 'pending'
    case 'failed':
    case 'rejected':
      return 'failed'
    default:
      return 'unknown'
  }
}

const META_KEYS = [
  'refund_type',
  'payment_method',
  'order_id',
  'order_number',
  'original_order_id',
  'original_order_number',
  'client_transaction_id',
  'processed_at',
  'staff_id',
  'status',
] as const

export function transformRefund(raw: RawYocoRefund): Refund {
  const id = readId(raw.id, 'refund')
  const total = readMoney(raw.total_amount, 'total_amount', id)
  return {
    id,
    externalId: id,
    chargeId: readId(raw.payment_id, `refund ${id} payment_id`),
    amount: total.amount,
    currency: total.currency,
    status: mapStatus(raw.status),
    receiptNumber: optionalString(raw.receipt_number),
    gateway: 'yoco',
    metadata: stringFields(raw, META_KEYS),
    createdAt: optionalString(raw.created_at),
    updatedAt: optionalString(raw.updated_at),
    raw,
  }
}
