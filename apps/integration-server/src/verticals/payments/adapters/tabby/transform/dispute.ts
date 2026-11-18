/**
 * Tabby dispute transform.
 *
 * Disputes are raised by buyers against a specific payment and are managed
 * via:
 *   GET /api/v1/disputes           — list (returns { disputes: [], next_page_token })
 *   GET /api/v1/disputes/{id}      — retrieve (includes full history)
 *
 * Money is a decimal string in the major unit (e.g. `"100.00"`); we convert to
 * integer minor units via the payment currency using the shared helper.
 *
 * Tabby dispute statuses: new, declined, cancelled, refunded, in_progress,
 * evidence_merchant, evidence_customer. We map these to the canonical set.
 *
 * Docs:
 *   https://docs.tabby.ai/api-reference/disputes/get-dispute-by-id
 *   https://docs.tabby.ai/api-reference/disputes
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Dispute, DisputeStatus, DisputeReason } from '../../../schema/dispute'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawTabbyDisputeItem {
  reference_id?: string
  title?: string
  unit_price?: string
  [k: string]: unknown
}

export interface RawTabbyDispute {
  id?: string
  payment_id?: string
  amount?: string
  currency?: string
  created_at?: string
  expired_at?: string
  status?: string
  reason?: string
  days_left?: number
  order_number?: string
  comment?: string | null
  attachments?: unknown[] | null
  history?: unknown[]
  items?: RawTabbyDisputeItem[]
  [k: string]: unknown
}

/** List-response envelope from GET /api/v1/disputes. */
export interface RawTabbyDisputeList {
  disputes?: RawTabbyDispute[]
  next_page_token?: string
  [k: string]: unknown
}

function mapDisputeStatus(raw: string | undefined): DisputeStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'new':
      return 'needs_response'
    case 'evidence_merchant':
      return 'needs_response'
    case 'evidence_customer':
      return 'under_review'
    case 'in_progress':
      return 'under_review'
    case 'refunded':
      return 'charge_refunded'
    case 'declined':
      return 'lost'
    case 'cancelled':
      return 'warning_closed'
    default:
      return 'under_review'
  }
}

function mapDisputeReason(raw: string | undefined): DisputeReason | undefined {
  switch ((raw ?? '').toLowerCase()) {
    case 'unreceived_refund':
      return 'credit_not_processed'
    case 'identity_theft':
      return 'fraudulent'
    case 'product_issue':
      return 'product_unacceptable'
    case 'not_delivered':
      return 'product_not_received'
    default:
      return undefined
  }
}

export function transformDispute(raw: RawTabbyDispute): Dispute {
  const currency = pickCurrency(raw.currency)
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.payment_id ?? ''),
    amount: toMinorUnits(raw.amount, currency) ?? 0,
    currency,
    status: mapDisputeStatus(raw.status),
    reason: mapDisputeReason(raw.reason),
    evidenceDueBy: toIsoDatetime(raw.expired_at),
    gateway: 'tabby',
    metadata: strMap({
      tabby_status: raw.status,
      tabby_reason: raw.reason,
      order_number: raw.order_number,
      comment: raw.comment,
      days_left: raw.days_left,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
