/**
 * Opn Payments (Omise) Dispute transform.
 *
 * Opn Payments exposes disputes via GET /disputes and GET /disputes/{id}.
 *
 * Docs: https://docs.omise.co/disputes-api
 *
 * Key response fields:
 *   id, amount, currency, status ("open"|"pending"|"won"|"lost"),
 *   charge (charge id), reason_code, reason_message, created_at
 */

import type { Dispute, DisputeStatus, DisputeReason } from '../../../schema/dispute'
import { pickCurrency, strMap, safeInt } from './shared'

export interface RawOpnDispute {
  [k: string]: unknown
}

function mapStatus(s: string | undefined): DisputeStatus {
  const v = (s ?? '').toLowerCase()
  if (v === 'open') return 'needs_response'
  if (v === 'pending') return 'under_review'
  if (v === 'won') return 'won'
  if (v === 'lost') return 'lost'
  return 'needs_response'
}

/**
 * Opn Payments uses reason_code strings. Map common codes to canonical reasons.
 * Full list is not documented; fall through to 'other'.
 */
function mapReason(code: string | undefined): DisputeReason {
  const c = (code ?? '').toLowerCase()
  if (c.includes('fraud') || c === 'unauthorized') return 'fraudulent'
  if (c.includes('duplicate')) return 'duplicate'
  if (c.includes('not_received') || c.includes('not_delivered')) return 'product_not_received'
  if (c.includes('unacceptable') || c.includes('defective')) return 'product_unacceptable'
  if (c.includes('credit') || c.includes('refund_not_processed')) return 'credit_not_processed'
  if (c.includes('subscription') || c.includes('cancelled')) return 'subscription_cancelled'
  if (c.includes('unrecognized')) return 'unrecognized'
  return 'other'
}

export function transformDispute(raw: RawOpnDispute): Dispute {
  const id = String(raw['id'] ?? '')

  return {
    id,
    externalId: id,
    chargeId: raw['charge'] != null ? String(raw['charge']) : '',
    amount: safeInt(raw['amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'THB'),
    status: mapStatus(raw['status'] as string | undefined),
    reason: raw['reason_code'] != null
      ? mapReason(raw['reason_code'] as string)
      : undefined,
    gateway: 'opn-payments',
    metadata: strMap(raw['metadata'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    raw,
  }
}
