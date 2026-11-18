/**
 * Airwallex Refund → canonical Refund.
 *
 * A refund is taken against a PaymentIntent (`payment_intent_id`), which is our
 * canonical `chargeId`. Money is in **major units** and scaled to minor units.
 *
 * Refund statuses: RECEIVED / PENDING (in flight), SUCCEEDED / SETTLED
 * (the SUCCEEDED status was renamed SETTLED in newer API versions — we accept
 * both), FAILED.
 *
 * Refs:
 *   https://www.airwallex.com/docs/api/payments/refunds
 *   https://www.airwallex.com/docs/payments/refunds
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus, RefundReason } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawAirwallexRefund {
  id?: string
  payment_intent_id?: string
  payment_attempt_id?: string
  amount?: number
  currency?: string
  status?: string
  reason?: string
  acquirer_reference_number?: string
  created_at?: string
  updated_at?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(status: string | undefined): RefundStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'SUCCEEDED':
    case 'SETTLED':
      return 'succeeded'
    case 'FAILED':
      return 'failed'
    case 'CANCELLED':
      return 'cancelled'
    case 'RECEIVED':
    case 'PENDING':
      return 'pending'
    default:
      return 'pending'
  }
}

/** Map Airwallex free-text reasons onto the canonical closed set. */
function mapReason(reason: string | undefined): RefundReason | undefined {
  const r = (reason ?? '').toLowerCase()
  if (!r) return undefined
  if (r.includes('duplicate')) return 'duplicate'
  if (r.includes('fraud')) return 'fraudulent'
  if (r.includes('customer') || r.includes('requested')) return 'requested_by_customer'
  return 'other'
}

export function transformRefund(raw: RawAirwallexRefund): Refund {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.payment_intent_id ?? ''),
    amount: toMinorUnits(raw.amount) ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw.status),
    reason: mapReason(raw.reason),
    receiptNumber: raw.acquirer_reference_number ?? undefined,
    gateway: 'airwallex',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
