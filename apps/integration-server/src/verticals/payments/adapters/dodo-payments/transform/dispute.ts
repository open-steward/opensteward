/**
 * Dodo Payments `Dispute` → canonical `Dispute`.
 *
 * Dodo models disputes with a `dispute_status` enum and a `dispute_stage`
 * (pre_dispute | dispute | pre_arbitration). Amounts are integer minor units.
 *
 * Status values:
 *   dispute_opened, dispute_expired, dispute_accepted, dispute_cancelled,
 *   dispute_challenged, dispute_won, dispute_lost
 *
 * Docs: https://docs.dodopayments.com/api-reference/disputes/get-disputes
 */
import type { Dispute, DisputeStatus } from '../../../schema/dispute'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, strMap } from './shared'

export interface RawDodoDispute {
  dispute_id?: string
  payment_id?: string
  business_id?: string
  amount?: string | number
  currency?: string
  dispute_status?: string
  dispute_stage?: string
  created_at?: string
  payment_provider?: string
  is_resolved_by_rdr?: boolean | null
  [k: string]: unknown
}

function mapStatus(raw: RawDodoDispute): DisputeStatus {
  switch ((raw.dispute_status ?? '').toLowerCase()) {
    case 'dispute_opened':
      return 'needs_response'
    case 'dispute_challenged':
      return 'under_review'
    case 'dispute_won':
      return 'won'
    case 'dispute_lost':
      return 'lost'
    case 'dispute_accepted':
      return 'charge_refunded'
    case 'dispute_cancelled':
    case 'dispute_expired':
      return 'warning_closed'
    default:
      return 'needs_response'
  }
}

export function transformDispute(raw: RawDodoDispute): Dispute {
  return {
    id: String(raw.dispute_id ?? ''),
    externalId: String(raw.dispute_id ?? ''),
    chargeId: String(raw.payment_id ?? ''),
    amount: typeof raw.amount === 'string' ? parseInt(raw.amount, 10) || 0 : (raw.amount ?? 0),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    reason: undefined,
    evidenceDueBy: undefined,
    network: raw.payment_provider ?? undefined,
    gateway: 'dodo-payments',
    metadata: strMap({
      dispute_stage: raw.dispute_stage,
      is_resolved_by_rdr: raw.is_resolved_by_rdr,
      business_id: raw.business_id,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
