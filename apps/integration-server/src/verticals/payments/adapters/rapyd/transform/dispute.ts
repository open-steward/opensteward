import type { Dispute, DisputeReason, DisputeStatus } from '../../../schema/dispute'
import { pickCurrency, pickStr, strMap, toIsoDatetime, toMinorUnits } from './shared'

/**
 * Rapyd Dispute object (subset).
 * Rapyd disputes are chargeback / retrieval requests from card networks.
 * Docs: https://docs.rapyd.net/en/retrieve-dispute.html
 */
export interface RawRapydDispute {
  id?: string
  token?: string
  payment?: string
  amount?: number | string
  currency?: string
  currency_code?: string
  status?: string
  reason_code?: string
  reason_description?: string
  created_at?: number
  updated_at?: number
  due_date?: number
  network?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(s: string | undefined): DisputeStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'waiting_for_merchant':
    case 'pending':
      return 'needs_response'
    case 'under_review':
    case 'reviewing':
      return 'under_review'
    case 'won':
    case 'accepted':
      return 'won'
    case 'lost':
    case 'rejected':
      return 'lost'
    case 'refunded':
    case 'charge_refunded':
      return 'charge_refunded'
    default:
      return 'needs_response'
  }
}

function mapReason(reasonCode: string | undefined): DisputeReason | undefined {
  if (!reasonCode) return undefined
  const r = reasonCode.toLowerCase()
  if (r.includes('fraud')) return 'fraudulent'
  if (r.includes('duplicate')) return 'duplicate'
  if (r.includes('not_received') || r.includes('product_not_received')) return 'product_not_received'
  if (r.includes('unacceptable') || r.includes('product_unacceptable')) return 'product_unacceptable'
  if (r.includes('credit') || r.includes('credit_not_processed')) return 'credit_not_processed'
  if (r.includes('subscription') || r.includes('cancelled')) return 'subscription_cancelled'
  if (r.includes('unrecognized') || r.includes('unrecognised')) return 'unrecognized'
  return 'other'
}

export function transformDispute(raw: RawRapydDispute): Dispute {
  const id = pickStr(raw.id ?? raw.token) ?? ''
  return {
    id,
    externalId: id,
    chargeId: pickStr(raw.payment) ?? '',
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency ?? raw.currency_code),
    status: mapStatus(raw.status),
    reason: mapReason(raw.reason_code),
    evidenceDueBy: toIsoDatetime(raw.due_date),
    network: pickStr(raw.network),
    gateway: 'rapyd',
    metadata: strMap({
      ...raw.metadata,
      reason_description: raw.reason_description,
      reason_code: raw.reason_code,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
