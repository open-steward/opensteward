import type { Dispute, DisputeStatus, DisputeReason } from '../../../schema/dispute'
import { pickCurrency, strMap, safeInt } from './shared'

/**
 * Pin Payments Dispute object.
 * GET /disputes → paginated list of disputes.
 * GET /disputes/{dispute-token} → single dispute.
 *
 * Confirmed fields from https://pinpayments.com/developers/api-reference/disputes
 */
export interface RawPinDispute {
  [k: string]: unknown
}

function mapStatus(s: string | undefined | null): DisputeStatus {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'evidence_required' || v === 'needs_response') return 'needs_response'
  if (v === 'evidence_under_review' || v === 'under_review') return 'under_review'
  if (v === 'won' || v === 'resolved_merchant_won') return 'won'
  if (v === 'lost' || v === 'resolved_merchant_lost') return 'lost'
  if (v === 'charge_refunded') return 'charge_refunded'
  return 'needs_response'
}

function mapReason(s: string | undefined | null): DisputeReason | undefined {
  if (!s) return undefined
  const v = s.toLowerCase()
  if (v === 'general') return 'general'
  if (v === 'fraudulent' || v === 'fraud') return 'fraudulent'
  if (v === 'duplicate') return 'duplicate'
  if (v === 'product_not_received') return 'product_not_received'
  if (v === 'product_unacceptable') return 'product_unacceptable'
  if (v === 'subscription_cancelled') return 'subscription_cancelled'
  if (v === 'credit_not_processed') return 'credit_not_processed'
  if (v === 'unrecognized') return 'unrecognized'
  return 'other'
}

export function transformDispute(raw: RawPinDispute): Dispute {
  // charge may be a nested object; extract charge token from it
  const charge = raw['charge'] as Record<string, unknown> | undefined
  const chargeId = String(charge?.['token'] ?? raw['charge_token'] ?? '')

  return {
    id: String(raw['token'] ?? ''),
    externalId: String(raw['token'] ?? ''),
    chargeId,
    amount: safeInt(raw['amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'AUD'),
    status: mapStatus(raw['status'] as string | undefined),
    reason: mapReason(raw['category'] as string | undefined),
    evidenceDueBy:
      raw['evidence_required_by'] != null ? String(raw['evidence_required_by']) : undefined,
    gateway: 'pin-payments',
    metadata: strMap(raw['metadata'] ?? {}),
    createdAt: raw['received_at'] != null ? String(raw['received_at']) : undefined,
    updatedAt: undefined,
    raw,
  }
}
