/**
 * Paddle `Adjustment` (action=chargeback|chargeback_warning) → canonical `Dispute`.
 *
 * Paddle is merchant-of-record: disputes are raised against Paddle, not the
 * seller. Paddle automatically creates adjustments with action=chargeback or
 * action=chargeback_warning at GET /adjustments. There is no dedicated
 * /disputes endpoint; this transform is derived from the same RawPaddleAdjustment
 * type used by refunds, filtered to chargeback action types.
 *
 * Evidence submission is not available through the Paddle seller API (Paddle
 * handles dispute defence automatically as MOR).
 */
import type { Dispute, DisputeStatus, DisputeReason } from '../../../schema/dispute'
import { pickCurrency, strMap, strToMinor } from './shared'
import type { RawPaddleAdjustment } from './refund'

function mapStatus(raw: RawPaddleAdjustment): DisputeStatus {
  const action = (raw.action ?? '').toLowerCase()
  const status = (raw.status ?? '').toLowerCase()

  if (action === 'chargeback_reverse' || action === 'chargeback_warning_reverse') {
    return 'charge_refunded'
  }
  if (action === 'chargeback_warning') {
    return status === 'reversed' ? 'warning_closed' : 'warning_needs_response'
  }
  // action === 'chargeback'
  switch (status) {
    case 'approved':
      return 'lost'
    case 'reversed':
      return 'won'
    case 'rejected':
      return 'won'
    default:
      return 'needs_response'
  }
}

function mapReason(raw: RawPaddleAdjustment): DisputeReason | undefined {
  const r = (raw.reason ?? '').toLowerCase()
  if (r.includes('fraud')) return 'fraudulent'
  if (r.includes('duplicate')) return 'duplicate'
  if (r.includes('subscription') || r.includes('cancel')) return 'subscription_cancelled'
  if (r.includes('not received') || r.includes('not_received')) return 'product_not_received'
  if (r.includes('unacceptable') || r.includes('defective')) return 'product_unacceptable'
  if (r.includes('credit') || r.includes('refund')) return 'credit_not_processed'
  if (r.includes('unrecognized') || r.includes('unrecognised')) return 'unrecognized'
  if (r) return 'general'
  return undefined
}

export function transformDispute(raw: RawPaddleAdjustment): Dispute {
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
      action: raw.action,
      adjustment_status: raw.status,
      subscription_id: raw.subscription_id,
      customer_id: raw.customer_id,
      tax_amount: raw.totals?.tax,
      fee_amount: raw.totals?.fee,
    }),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
