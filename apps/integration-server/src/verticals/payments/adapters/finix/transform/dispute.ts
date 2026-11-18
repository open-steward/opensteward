/**
 * Finix `Dispute` ↔ canonical `Dispute`.
 *
 * A Finix dispute is a chargeback against a `Transfer`. `state` is PENDING /
 * INQUIRY / WON / LOST and `response_state` (NEEDS_RESPONSE / …) describes the
 * merchant action required; `reason` is FRAUD / GENERAL / … . The disputed
 * charge is `transfer`, and `respond_by` is the evidence deadline. Finix
 * omits a currency on the resource, so we fall back to the platform default.
 */
import type { Dispute, DisputeReason, DisputeStatus } from '../../../schema/dispute'
import { iso, pickCurrency, refId, strMap } from './shared'

export interface RawFinixDispute {
  id?: string
  amount?: number
  currency?: string | null
  state?: string
  response_state?: string | null
  reason?: string | null
  message?: string | null
  respond_by?: string | null
  occurred_at?: string | null
  transfer?: string | null
  identity?: string | null
  merchant?: string | null
  tags?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawFinixDispute): DisputeStatus {
  const responseState = (raw.response_state ?? '').toUpperCase()
  if (responseState === 'NEEDS_RESPONSE') return 'needs_response'
  switch ((raw.state ?? '').toUpperCase()) {
    case 'WON':
      return 'won'
    case 'LOST':
      return 'lost'
    case 'INQUIRY':
      return 'warning_needs_response'
    case 'PENDING':
      return 'needs_response'
    default:
      return 'needs_response'
  }
}

function mapReason(raw: RawFinixDispute): DisputeReason | undefined {
  switch ((raw.reason ?? '').toUpperCase()) {
    case 'FRAUD':
      return 'fraudulent'
    case 'DUPLICATE':
      return 'duplicate'
    case 'GENERAL':
      return 'general'
    case 'PRODUCT_NOT_RECEIVED':
      return 'product_not_received'
    case 'PRODUCT_UNACCEPTABLE':
      return 'product_unacceptable'
    default:
      return raw.reason ? 'other' : undefined
  }
}

export function transformDispute(raw: RawFinixDispute): Dispute {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: refId(raw.transfer) ?? '',
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    reason: mapReason(raw),
    evidenceDueBy: iso(raw.respond_by),
    gateway: 'finix',
    metadata: strMap({
      ...(raw.tags ?? {}),
      response_state: raw.response_state,
      message: raw.message,
      occurred_at: raw.occurred_at,
      identity: refId(raw.identity),
      merchant: refId(raw.merchant),
    }),
    createdAt: iso(raw.created_at),
    updatedAt: iso(raw.updated_at),
    raw,
  }
}
