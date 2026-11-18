import { requireAmount } from '@opensteward/shared'

import type { Dispute, DisputeReason, DisputeStatus } from '../../../schema/dispute'
import { pickCurrency, strMap } from './shared'

export interface RawCheckoutDispute {
  id?: string
  status?: string
  amount?: number
  currency?: string
  payment_id?: string
  reason_code?: string
  category?: string
  evidence_required_by?: string
  received_on?: string
  [k: string]: unknown
}

function mapStatus(raw: RawCheckoutDispute): DisputeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'evidence_required':
      return 'needs_response'
    case 'evidence_under_review':
      return 'under_review'
    case 'won':
    case 'arbitration_won':
      return 'won'
    case 'lost':
    case 'arbitration_lost':
      return 'lost'
    case 'accepted':
    case 'expired':
      return 'lost'
    default:
      return 'needs_response'
  }
}

function mapReason(raw: RawCheckoutDispute): DisputeReason | undefined {
  switch ((raw.category ?? '').toLowerCase()) {
    case 'fraudulent':
      return 'fraudulent'
    case 'general':
      return 'general'
    case 'duplicate':
      return 'duplicate'
    case 'not_received':
      return 'product_not_received'
    case 'product_unacceptable':
      return 'product_unacceptable'
    case 'credit_not_processed':
      return 'credit_not_processed'
    default:
      return raw.category ? 'other' : undefined
  }
}

export function transformDispute(raw: RawCheckoutDispute): Dispute {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.payment_id ?? ''),
    amount: requireAmount(raw.amount, 'checkout-com dispute'),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    reason: mapReason(raw),
    evidenceDueBy: raw.evidence_required_by,
    gateway: 'checkout-com',
    metadata: strMap({ reason_code: raw.reason_code }),
    createdAt: raw.received_on,
    raw,
  }
}
