import type { Dispute, DisputeReason, DisputeStatus } from '../../../schema/dispute'
import { toIso, strMap } from './shared'

export interface RawStripeDispute {
  id: string
  object: 'dispute'
  amount: number
  currency: string
  status: string
  reason?: string | null
  charge?: string | null
  payment_intent?: string | null
  network?: string | null
  evidence_details?: { due_by?: number | null } | null
  metadata?: Record<string, string> | null
  created?: number
  [key: string]: unknown
}

function mapStatus(raw: RawStripeDispute): DisputeStatus {
  switch (raw.status) {
    case 'warning_needs_response':
      return 'warning_needs_response'
    case 'warning_under_review':
      return 'warning_under_review'
    case 'warning_closed':
      return 'warning_closed'
    case 'needs_response':
      return 'needs_response'
    case 'under_review':
      return 'under_review'
    case 'won':
      return 'won'
    case 'lost':
      return 'lost'
    case 'charge_refunded':
      return 'charge_refunded'
    default:
      return 'needs_response'
  }
}

function mapReason(raw: RawStripeDispute): DisputeReason | undefined {
  switch (raw.reason) {
    case 'duplicate':
      return 'duplicate'
    case 'fraudulent':
      return 'fraudulent'
    case 'subscription_canceled':
      return 'subscription_cancelled'
    case 'product_not_received':
      return 'product_not_received'
    case 'product_unacceptable':
      return 'product_unacceptable'
    case 'credit_not_processed':
      return 'credit_not_processed'
    case 'general':
      return 'general'
    case 'unrecognized':
      return 'unrecognized'
    default:
      return raw.reason ? 'other' : undefined
  }
}

export function transformDispute(raw: RawStripeDispute): Dispute {
  return {
    id: raw.id,
    externalId: raw.id,
    chargeId: raw.charge ?? raw.payment_intent ?? '',
    amount: raw.amount,
    currency: raw.currency.toUpperCase(),
    status: mapStatus(raw),
    reason: mapReason(raw),
    evidenceDueBy: toIso(raw.evidence_details?.due_by),
    network: raw.network ?? undefined,
    gateway: 'stripe',
    metadata: strMap(raw.metadata),
    createdAt: toIso(raw.created),
    raw,
  }
}
