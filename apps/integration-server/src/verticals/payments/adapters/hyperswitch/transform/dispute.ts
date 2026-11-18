/**
 * Hyperswitch DisputeResponse → canonical Dispute.
 *
 * Disputes are exposed via GET /disputes/list and GET /disputes/{dispute_id}.
 * Amounts arrive as a string in minor units (`StringMinorUnit`); we parse them
 * to an integer. `dispute_status` maps to canonical `DisputeStatus`;
 * `dispute_stage` and `connector` are carried in metadata.
 *
 * Docs: https://api-reference.hyperswitch.io/v1/disputes/disputes--retrieve
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Dispute, DisputeStatus } from '../../../schema/dispute'
import { pickCurrency, strMap } from './shared'

export interface RawHyperswitchDispute {
  dispute_id?: string
  payment_id?: string
  attempt_id?: string
  amount?: string | number
  currency?: string
  dispute_stage?: string | null
  dispute_status?: string
  connector?: string | null
  connector_status?: string | null
  connector_dispute_id?: string | null
  connector_reason?: string | null
  connector_reason_code?: string | null
  challenge_required_by?: string | null
  connector_created_at?: string | null
  connector_updated_at?: string | null
  created_at?: string | null
  profile_id?: string | null
  merchant_connector_id?: string | null
  is_already_refunded?: boolean
  [k: string]: unknown
}

function mapStatus(raw: RawHyperswitchDispute): DisputeStatus {
  switch ((raw.dispute_status ?? '').toLowerCase()) {
    case 'dispute_opened':
      return 'needs_response'
    case 'dispute_expired':
      return 'warning_closed'
    case 'dispute_accepted':
      return 'charge_refunded'
    case 'dispute_cancelled':
      return 'warning_closed'
    case 'dispute_challenged':
      return 'under_review'
    case 'dispute_won':
      return 'won'
    case 'dispute_lost':
      return 'lost'
    default:
      return 'needs_response'
  }
}

export function transformDispute(raw: RawHyperswitchDispute): Dispute {
  const id = String(raw.dispute_id ?? '')
  // Hyperswitch sends `amount` as a StringMinorUnit (numeric string)
  const amount = typeof raw.amount === 'string' ? parseInt(raw.amount, 10) : (raw.amount ?? 0)
  return {
    id,
    externalId: id,
    chargeId: String(raw.payment_id ?? ''),
    amount: isNaN(amount) ? 0 : amount,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    evidenceDueBy: toIsoDatetime(raw.challenge_required_by) ?? undefined,
    gateway: 'hyperswitch',
    metadata: strMap({
      dispute_stage: raw.dispute_stage,
      connector: raw.connector,
      connector_status: raw.connector_status,
      connector_dispute_id: raw.connector_dispute_id,
      connector_reason: raw.connector_reason,
      connector_reason_code: raw.connector_reason_code,
      attempt_id: raw.attempt_id,
      profile_id: raw.profile_id,
      merchant_connector_id: raw.merchant_connector_id,
    }),
    createdAt: toIsoDatetime(raw.created_at) ?? undefined,
    updatedAt: toIsoDatetime(raw.connector_updated_at) ?? undefined,
    raw,
  }
}
