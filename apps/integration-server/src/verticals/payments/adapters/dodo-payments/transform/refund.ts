/**
 * Dodo Payments `Refund` → canonical `Refund`.
 *
 * Refund status values: succeeded, failed, pending, review.
 *
 * Docs: https://docs.dodopayments.com/api-reference/refunds/get-refunds
 */
import type { Refund, RefundStatus } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, strMap } from './shared'

export interface RawDodoRefund {
  refund_id?: string
  payment_id?: string
  business_id?: string
  amount?: number | null
  currency?: string | null
  status?: string
  reason?: string | null
  is_partial?: boolean
  created_at?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawDodoRefund): RefundStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'succeeded':
      return 'succeeded'
    case 'failed':
      return 'failed'
    case 'pending':
    case 'review':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawDodoRefund): Refund {
  return {
    id: String(raw.refund_id ?? ''),
    externalId: String(raw.refund_id ?? ''),
    chargeId: String(raw.payment_id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    gateway: 'dodo-payments',
    metadata: strMap({ ...raw.metadata, reason: raw.reason, is_partial: raw.is_partial }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
