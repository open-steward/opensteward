/**
 * Airwallex Payment Dispute → canonical Dispute.
 *
 * Disputes live under the `/api/v1/pa/payment_disputes` path (the PA prefix
 * shared with PaymentIntents and Refunds). Each dispute references the
 * originating PaymentIntent via `payment_intent_id`.
 *
 * Status values (uppercase from Airwallex): REQUIRES_RESPONSE, UNDER_REVIEW,
 * WON, LOST, ACCEPTED (mapped to canonical DisputeStatus).
 *
 * Money is in **major units** and scaled to minor units.
 *
 * Refs:
 *   https://www.airwallex.com/docs/api/payments/disputes
 *   https://www.airwallex.com/docs/payments/payment-operations/disputes/handle-disputes-using-our-apis
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Dispute, DisputeStatus, DisputeReason } from '../../../schema/dispute'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawAirwallexDisputeReason {
  type?: string          // e.g. FRAUDULENT, UNRECOGNIZED, PRODUCT_NOT_RECEIVED …
  description?: string
  original_code?: string
  [k: string]: unknown
}

export interface RawAirwallexDispute {
  id?: string
  payment_intent_id?: string
  amount?: number         // major units
  currency?: string
  status?: string         // REQUIRES_RESPONSE | UNDER_REVIEW | WON | LOST | ACCEPTED
  stage?: string          // CHARGEBACK | PRE_CHARGEBACK | ARBITRATION
  reason?: RawAirwallexDisputeReason | string
  reason_code?: string
  due_at?: string         // deadline to respond
  card_brand?: string     // visa | mastercard | amex …
  payment_method_type?: string
  acquirer_reference_number?: string
  merchant_order_id?: string
  created_at?: string
  updated_at?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawAirwallexDispute): DisputeStatus {
  const s = (raw.status ?? '').toUpperCase()
  // ACCEPTED = merchant explicitly accepted the dispute (= charge_refunded)
  if (s === 'ACCEPTED') return 'charge_refunded'
  if (s === 'WON') return 'won'
  if (s === 'LOST') return 'lost'
  // UNDER_REVIEW variants
  if (s === 'UNDER_REVIEW') return 'under_review'
  // PRE_CHARGEBACK warning variants
  const stage = (raw.stage ?? '').toUpperCase()
  if (stage === 'PRE_CHARGEBACK') {
    if (s === 'REQUIRES_RESPONSE') return 'warning_needs_response'
    if (s === 'UNDER_REVIEW') return 'warning_under_review'
    if (s === 'CLOSED') return 'warning_closed'
  }
  if (s === 'REQUIRES_RESPONSE') return 'needs_response'
  return 'needs_response'
}

function mapReason(raw: RawAirwallexDispute): DisputeReason | undefined {
  // `reason` may be an object or a plain string in some versions
  const reasonType =
    typeof raw.reason === 'object' && raw.reason !== null
      ? (raw.reason as RawAirwallexDisputeReason).type ?? ''
      : typeof raw.reason === 'string'
        ? raw.reason
        : raw.reason_code ?? ''
  const r = reasonType.toUpperCase()
  if (r.includes('FRAUD')) return 'fraudulent'
  if (r.includes('DUPLICATE')) return 'duplicate'
  if (r.includes('SUBSCRIPTION') || r.includes('CANCEL')) return 'subscription_cancelled'
  if (r.includes('NOT_RECEIVED') || r.includes('PRODUCT_NOT')) return 'product_not_received'
  if (r.includes('UNACCEPTABLE') || r.includes('NOT_AS')) return 'product_unacceptable'
  if (r.includes('CREDIT') || r.includes('REFUND')) return 'credit_not_processed'
  if (r.includes('UNRECOGNIZED') || r.includes('UNAUTHORI')) return 'unrecognized'
  if (!r) return undefined
  return 'general'
}

export function transformDispute(raw: RawAirwallexDispute): Dispute {
  const reasonObj =
    typeof raw.reason === 'object' && raw.reason !== null
      ? (raw.reason as RawAirwallexDisputeReason)
      : undefined

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.payment_intent_id ?? ''),
    amount: toMinorUnits(raw.amount) ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    reason: mapReason(raw),
    evidenceDueBy: toIsoDatetime(raw.due_at),
    network: raw.card_brand ?? undefined,
    gateway: 'airwallex',
    metadata: strMap({
      stage: raw.stage,
      reason_code: raw.reason_code ?? reasonObj?.original_code,
      merchant_order_id: raw.merchant_order_id,
      acquirer_reference_number: raw.acquirer_reference_number,
      ...raw.metadata,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
