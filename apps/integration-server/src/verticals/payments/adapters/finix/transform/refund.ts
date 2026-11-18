/**
 * Finix reversal `Transfer` (type REVERSAL) ↔ canonical `Refund`.
 *
 * A refund in Finix is a `Transfer` with `type: REVERSAL` created via
 * `POST /transfers/{id}/reversals`. `parent_transfer` (and its trace id) link
 * back to the original DEBIT charge. State mirrors a normal transfer:
 * SUCCEEDED / PENDING / FAILED / CANCELED.
 */
import type { Refund, RefundStatus } from '../../../schema/refund'
import { iso, pickCurrency, refId, strMap } from './shared'

export interface RawFinixReversal {
  id?: string
  type?: string
  state?: string
  amount?: number
  currency?: string
  parent_transfer?: string | null
  parent_transfer_trace_id?: string | null
  trace_id?: string | null
  failure_code?: string | null
  failure_message?: string | null
  tags?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawFinixReversal): RefundStatus {
  switch ((raw.state ?? '').toUpperCase()) {
    case 'SUCCEEDED':
      return 'succeeded'
    case 'PENDING':
      return 'pending'
    case 'FAILED':
      return 'failed'
    case 'CANCELED':
    case 'CANCELLED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawFinixReversal): Refund {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: refId(raw.parent_transfer) ?? '',
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    failureReason: raw.failure_message ?? raw.failure_code ?? undefined,
    gateway: 'finix',
    metadata: strMap({
      ...(raw.tags ?? {}),
      trace_id: raw.trace_id,
      parent_transfer_trace_id: raw.parent_transfer_trace_id,
    }),
    createdAt: iso(raw.created_at),
    updatedAt: iso(raw.updated_at),
    raw,
  }
}
