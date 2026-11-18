/**
 * Razorpay Dispute → canonical Dispute.
 *
 * Razorpay exposes disputes via /disputes (requires RazorpayX route access).
 * Razorpay calls these "payment disputes" and the amounts are already in
 * integer minor units (paise for INR). Timestamps are Unix seconds.
 *
 * Key fields: id, payment_id, amount, currency, status, reason_code,
 *             created_at, updated_at, respond_by
 */
import type { Dispute, DisputeReason, DisputeStatus } from '../../../schema/dispute'
import { pickCurrency, strMap, toIso } from './shared'

export interface RawRazorpayDispute {
  id?: string
  payment_id?: string
  amount?: number
  currency?: string
  status?: string
  reason_code?: string
  respond_by?: number
  created_at?: number
  updated_at?: number
  [k: string]: unknown
}

function mapStatus(status: string | undefined): DisputeStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'open':
    case 'under_review':
      return 'under_review'
    case 'won':
      return 'won'
    case 'lost':
      return 'lost'
    case 'closed':
      return 'charge_refunded'
    case 'accepted':
      return 'warning_closed'
    default:
      return 'needs_response'
  }
}

function mapReason(reasonCode: string | undefined): DisputeReason | undefined {
  if (!reasonCode) return undefined
  const code = reasonCode.toLowerCase()
  if (code.includes('fraud') || code.includes('unauthoris') || code.includes('unauthoriz')) return 'fraudulent'
  if (code.includes('duplicate')) return 'duplicate'
  if (code.includes('not_received') || code.includes('not_delivered')) return 'product_not_received'
  if (code.includes('unacceptable') || code.includes('not_as_described')) return 'product_unacceptable'
  if (code.includes('credit_not_processed') || code.includes('refund_not_processed')) return 'credit_not_processed'
  if (code.includes('subscription')) return 'subscription_cancelled'
  if (code.includes('unrecognized') || code.includes('unrecognised')) return 'unrecognized'
  if (code.includes('general')) return 'general'
  return 'other'
}

export function transformDispute(raw: RawRazorpayDispute): Dispute {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.payment_id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw.status),
    reason: mapReason(raw.reason_code),
    evidenceDueBy: toIso(raw.respond_by),
    gateway: 'razorpay',
    metadata: strMap(raw),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    raw,
  }
}
