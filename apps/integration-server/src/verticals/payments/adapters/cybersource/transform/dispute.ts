/**
 * Cybersource Dispute (Chargeback) transform.
 *
 * Cybersource exposes chargebacks / disputes via the Dispute API at
 * GET /dispute/v1/disputes. Fields come back in the standard Cybersource
 * envelope format.
 *
 * Docs: https://developer.cybersource.com/api/reference/api-reference.html#disputes
 */

import type { Dispute, DisputeStatus, DisputeReason } from '../../../schema/dispute'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawCybersourceDispute {
  id?: string
  paymentId?: string
  chargeId?: string
  caseNumber?: string
  type?: string
  status?: string
  reasonCode?: string
  reasonDescription?: string
  amount?: string | number
  currency?: string
  network?: string
  evidenceDueDate?: string
  submitTimeUtc?: string
  lastModifiedTime?: string
  [k: string]: unknown
}

function mapStatus(s: string | undefined): DisputeStatus {
  const v = (s ?? '').toLowerCase().replace(/[^a-z_]/g, '_')
  if (v.includes('warning')) {
    if (v.includes('needs_response') || v.includes('need')) return 'warning_needs_response'
    if (v.includes('review')) return 'warning_under_review'
    if (v.includes('closed')) return 'warning_closed'
    return 'warning_needs_response'
  }
  if (v.includes('needs_response') || v === 'open' || v === 'new') return 'needs_response'
  if (v.includes('under_review') || v.includes('in_review') || v === 'review') return 'under_review'
  if (v === 'won' || v === 'closed_won') return 'won'
  if (v === 'lost' || v === 'closed_lost') return 'lost'
  if (v.includes('refund')) return 'charge_refunded'
  return 'needs_response'
}

function mapReason(reasonCode: string | undefined, reasonDesc: string | undefined): DisputeReason | undefined {
  const code = (reasonCode ?? '').toUpperCase()
  const desc = (reasonDesc ?? '').toLowerCase()

  if (code === '4853' || desc.includes('not received')) return 'product_not_received'
  if (code === '4855' || desc.includes('cancelled') || desc.includes('subscription')) return 'subscription_cancelled'
  if (code === '4863' || desc.includes('unrecognized') || desc.includes('unrecognised')) return 'unrecognized'
  if (code === '4834' || desc.includes('duplicate')) return 'duplicate'
  if (desc.includes('fraud') || code === '4840' || code === '4849') return 'fraudulent'
  if (desc.includes('credit not processed') || desc.includes('credit_not')) return 'credit_not_processed'
  if (desc.includes('unacceptable') || desc.includes('not as described')) return 'product_unacceptable'
  return 'general'
}

export function transformDispute(raw: RawCybersourceDispute): Dispute {
  return {
    id: String(raw.id ?? raw.caseNumber ?? ''),
    externalId: String(raw.id ?? raw.caseNumber ?? ''),
    chargeId: String(raw.paymentId ?? raw.chargeId ?? ''),
    amount: decimalToMinor(raw.amount),
    currency: pickCurrency(raw.currency as string | undefined),
    status: mapStatus(raw.status),
    reason: mapReason(raw.reasonCode, raw.reasonDescription),
    evidenceDueBy: raw.evidenceDueDate ?? undefined,
    network: raw.network ?? undefined,
    gateway: 'cybersource',
    metadata: strMap({
      caseNumber: raw.caseNumber,
      type: raw.type,
      reasonCode: raw.reasonCode,
    }),
    createdAt: raw.submitTimeUtc ?? undefined,
    updatedAt: raw.lastModifiedTime ?? undefined,
    raw,
  }
}
