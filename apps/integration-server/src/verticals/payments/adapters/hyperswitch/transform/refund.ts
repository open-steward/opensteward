/**
 * Hyperswitch RefundResponse → canonical Refund.
 *
 * Refund `status` enum: succeeded | failed | pending | review. Amounts are
 * integer minor units; the refund references its parent via `payment_id`.
 *
 * Docs: https://api-reference.hyperswitch.io/api-reference/refunds/refunds--retrieve
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap } from './shared'

export interface RawHyperswitchRefund {
  refund_id?: string
  payment_id?: string
  amount?: number
  currency?: string
  status?: string
  reason?: string | null
  error_code?: string | null
  error_message?: string | null
  connector?: string | null
  profile_id?: string | null
  metadata?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
  [k: string]: unknown
}

function mapStatus(raw: RawHyperswitchRefund): RefundStatus {
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

export function transformRefund(raw: RawHyperswitchRefund): Refund {
  const id = String(raw.refund_id ?? '')
  return {
    id,
    externalId: id,
    chargeId: String(raw.payment_id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    reason: raw.reason ? 'other' : undefined,
    failureReason: raw.error_message ?? undefined,
    gateway: 'hyperswitch',
    metadata: strMap({
      ...(raw.metadata ?? {}),
      reason: raw.reason,
      connector: raw.connector,
      profile_id: raw.profile_id,
      error_code: raw.error_code,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
