import type { Dispute, DisputeStatus } from '../../../schema/dispute'
import { pickCurrency, strMap } from './shared'

/**
 * Paystack Disputes API.
 * Endpoint: GET /dispute  — GET /dispute/:id
 * Docs: https://paystack.com/docs/api/dispute/
 *
 * Response fields confirmed from official docs:
 *   id, currency, refund_amount, status, resolution,
 *   transaction (nested: id, reference, amount, created_at),
 *   created_at, updated_at
 */
export interface RawPaystackDispute {
  id?: number
  currency?: string
  refund_amount?: number | null
  status?: string
  resolution?: string | null
  transaction?: {
    id?: number
    reference?: string
    amount?: number
    currency?: string
    created_at?: string
  } | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawPaystackDispute): DisputeStatus {
  const s = (raw.status ?? '').toLowerCase()
  const r = (raw.resolution ?? '').toLowerCase()
  if (s === 'resolved' && r === 'merchant-accepted') return 'won'
  if (s === 'resolved' && r === 'declined') return 'lost'
  if (s === 'resolved') return 'won'
  if (s === 'pending' || s === 'open') return 'needs_response'
  if (s === 'under_review') return 'under_review'
  if (s === 'awaiting-bank-feedback') return 'under_review'
  if (s === 'closed') return 'warning_closed'
  return 'needs_response'
}

export function transformDispute(raw: RawPaystackDispute): Dispute {
  const tx = raw.transaction
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(tx?.reference ?? tx?.id ?? ''),
    amount: tx?.amount ?? raw.refund_amount ?? 0,
    currency: pickCurrency(raw.currency ?? tx?.currency),
    status: mapStatus(raw),
    gateway: 'paystack',
    metadata: strMap({
      resolution: raw.resolution,
      refund_amount: raw.refund_amount,
    }),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
