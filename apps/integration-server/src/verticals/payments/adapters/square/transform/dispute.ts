import { requireAmount } from '@opensteward/shared'

import type { Dispute, DisputeReason, DisputeStatus } from '../../../schema/dispute'
import { pickCurrency, strMap } from './shared'

export interface RawSquareDispute {
  dispute_id?: string
  id?: string
  amount_money?: { amount?: number; currency?: string }
  reason?: string
  state?: string
  disputed_payment?: { payment_id?: string }
  due_at?: string
  card_brand?: string
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawSquareDispute): DisputeStatus {
  switch ((raw.state ?? '').toUpperCase()) {
    case 'INQUIRY_EVIDENCE_REQUIRED':
      return 'warning_needs_response'
    case 'INQUIRY_PROCESSING':
      return 'warning_under_review'
    case 'INQUIRY_CLOSED':
      return 'warning_closed'
    case 'EVIDENCE_REQUIRED':
      return 'needs_response'
    case 'PROCESSING':
      return 'under_review'
    case 'WON':
      return 'won'
    case 'LOST':
      return 'lost'
    case 'ACCEPTED':
      return 'charge_refunded'
    default:
      return 'needs_response'
  }
}

function mapReason(raw: RawSquareDispute): DisputeReason | undefined {
  switch ((raw.reason ?? '').toUpperCase()) {
    case 'PAYMENT_DUPLICATE':
      return 'duplicate'
    case 'FRAUD':
    case 'PROCESSED_AS_OF_AUTH':
      return 'fraudulent'
    case 'NOT_RECEIVED':
      return 'product_not_received'
    case 'NOT_AS_DESCRIBED':
      return 'product_unacceptable'
    case 'CREDIT_NOT_PROCESSED':
      return 'credit_not_processed'
    default:
      return raw.reason ? 'other' : undefined
  }
}

export function transformDispute(raw: RawSquareDispute): Dispute {
  return {
    id: String(raw.dispute_id ?? raw.id ?? ''),
    externalId: String(raw.dispute_id ?? raw.id ?? ''),
    chargeId: raw.disputed_payment?.payment_id ?? '',
    amount: requireAmount(raw.amount_money?.amount, 'square dispute'),
    currency: pickCurrency(raw.amount_money?.currency),
    status: mapStatus(raw),
    reason: mapReason(raw),
    evidenceDueBy: raw.due_at,
    network: raw.card_brand?.toLowerCase(),
    gateway: 'square',
    metadata: strMap({}),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
