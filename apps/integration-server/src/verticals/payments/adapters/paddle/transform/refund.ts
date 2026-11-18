/**
 * Paddle `Adjustment` (action=refund) → canonical `Refund`.
 *
 * Paddle exposes refunds as adjustment objects at GET /adjustments.
 * `amount` is a string of integer minor units (same convention as transactions).
 */
import type { Refund, RefundReason, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, strToMinor } from './shared'

export interface RawPaddleAdjustment {
  id?: string
  action?: string
  transaction_id?: string
  subscription_id?: string
  customer_id?: string
  currency_code?: string
  status?: string
  reason?: string
  totals?: {
    total?: string
    tax?: string
    subtotal?: string
    fee?: string
  }
  credit_applied_to_balance?: string
  payout_totals?: { total?: string }
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawPaddleAdjustment): RefundStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'approved':
    case 'fully_applied':
      return 'succeeded'
    case 'rejected':
      return 'failed'
    case 'reversed':
      return 'cancelled'
    default:
      return 'pending'
  }
}

function mapReason(raw: RawPaddleAdjustment): RefundReason | undefined {
  const r = (raw.reason ?? '').toLowerCase()
  if (r.includes('fraud')) return 'fraudulent'
  if (r.includes('duplicate')) return 'duplicate'
  if (r.includes('customer') || r.includes('requested')) return 'requested_by_customer'
  if (r) return 'other'
  return undefined
}

export function transformRefund(raw: RawPaddleAdjustment): Refund {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: raw.transaction_id ?? '',
    amount: strToMinor(raw.totals?.total ?? raw.payout_totals?.total),
    currency: pickCurrency(raw.currency_code),
    status: mapStatus(raw),
    reason: mapReason(raw),
    gateway: 'paddle',
    metadata: strMap({
      subscription_id: raw.subscription_id,
      customer_id: raw.customer_id,
      action: raw.action,
      tax_amount: raw.totals?.tax,
      fee_amount: raw.totals?.fee,
      credit_applied_to_balance: raw.credit_applied_to_balance,
    }),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
