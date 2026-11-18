import type { Dispute, DisputeStatus } from '../../../schema/dispute'
import { decimalToMinor, pickCurrency, strMap } from './shared'

/**
 * Flutterwave v3 chargeback object from GET /v3/chargebacks
 */
export interface RawFlutterwaveChargeback {
  id?: number | string
  amount?: number
  flw_ref?: string
  status?: string
  stage?: string
  comment?: string
  due_date?: string
  created_at?: string
  transaction_id?: number | string
  currency?: string
  [k: string]: unknown
}

function mapStatus(raw: RawFlutterwaveChargeback): DisputeStatus {
  const status = (raw.status ?? '').toLowerCase()
  const stage = (raw.stage ?? '').toLowerCase()
  switch (status) {
    case 'won':
      return 'won'
    case 'lost':
      return 'lost'
    case 'accepted':
      return 'charge_refunded'
    case 'declined':
    case 'pending':
      if (stage === 'pre-arbitration' || stage === 'arbitration') return 'under_review'
      return 'needs_response'
    case 'resolved':
      return 'won'
    default:
      return 'needs_response'
  }
}

export function transformDispute(raw: RawFlutterwaveChargeback): Dispute {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.transaction_id ?? raw.flw_ref ?? ''),
    amount: decimalToMinor(raw.amount),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    reason: 'general',
    evidenceDueBy: raw.due_date,
    gateway: 'flutterwave',
    metadata: strMap({ stage: raw.stage, comment: raw.comment, flw_ref: raw.flw_ref }),
    createdAt: raw.created_at,
    raw,
  }
}
