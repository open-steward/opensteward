/**
 * Mercado Pago chargeback case → canonical Dispute.
 *
 * Shape from the first-party reference (same object on both endpoints):
 *   GET /v1/chargebacks/{id}
 *     https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-api-payments/chargebacks/get-chargeback/get.md
 *   GET /v1/chargebacks/search → `results[]`
 *     https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-api-payments/chargebacks/search-chargebacks/get.md
 *
 * Documented fields: `id`, `payments` ("IDs of the payments associated with
 * the case. May include multiple payments when they are cart or bundle
 * purchases."), `currency`, `amount` ("Total disputed amount."), `reason`
 * ("Human-readable reason for the chargeback, as provided by the payment
 * method or card network."), `reason_id`, `coverage_applied`,
 * `coverage_eligible`, `documentation_status`, `date_documentation_deadline`,
 * `date_created`, `date_last_updated`, `live_mode`.
 *
 * The case carries no status field. The only documented lifecycle signal is
 * `documentation_status`, whose `pending` ("The supporting documentation has
 * not yet been submitted by the seller.") and `review_pending` ("submitted and
 * is pending review by the Mercado Pago team") map to needs_response and
 * under_review; the other values say nothing about the outcome, so they map
 * to 'unknown'. `reason` is free text with no documented enum, so it is kept
 * in metadata rather than forced into the canonical reason.
 */
import { majorToMinor, toIsoDatetime } from '@opensteward/shared'
import type { Dispute, DisputeStatus } from '../../../schema/dispute'
import { strMap } from './shared'

export interface RawMPChargeback {
  id?: string
  payments?: (number | string)[]
  currency?: string
  /** Documented as a number; the documented example sends `"50.00"`. */
  amount?: number | string
  reason?: string
  reason_id?: string
  coverage_applied?: boolean | null
  coverage_eligible?: boolean
  documentation_required?: boolean
  documentation_status?: string
  date_documentation_deadline?: string | null
  date_created?: string
  date_last_updated?: string
  live_mode?: boolean
  [k: string]: unknown
}

function mapStatus(documentationStatus: string | undefined): DisputeStatus {
  switch (documentationStatus) {
    case 'pending':
      return 'needs_response'
    case 'review_pending':
      return 'under_review'
    default:
      return 'unknown'
  }
}

function missing(field: string): Error {
  return new Error(`Mercado Pago chargeback has no ${field}`)
}

function amountOf(raw: RawMPChargeback, currency: string): number {
  // Number('') is 0: a blank or non-numeric amount is missing, never zero.
  const value =
    typeof raw.amount === 'string'
      ? raw.amount.trim() === ''
        ? undefined
        : Number(raw.amount)
      : raw.amount
  const minor = majorToMinor(value, currency)
  if (minor === undefined) throw missing('amount')
  return minor
}

export function transformDispute(raw: RawMPChargeback): Dispute {
  if (raw.id == null || raw.id === '') throw missing('id')
  const id = String(raw.id)
  const paymentId = raw.payments?.[0]
  if (paymentId == null || paymentId === '') throw missing('payments[0]')
  if (!raw.currency) throw missing('currency')
  const currency = raw.currency
  return {
    id,
    externalId: id,
    chargeId: String(paymentId),
    amount: amountOf(raw, currency),
    currency,
    status: mapStatus(raw.documentation_status),
    evidenceDueBy: toIsoDatetime(raw.date_documentation_deadline),
    gateway: 'mercado-pago',
    metadata: strMap({
      payments: raw.payments?.map(String).join(','),
      reason: raw.reason,
      reason_id: raw.reason_id,
      documentation_status: raw.documentation_status,
      coverage_applied: raw.coverage_applied,
      coverage_eligible: raw.coverage_eligible,
      live_mode: raw.live_mode,
    }),
    createdAt: toIsoDatetime(raw.date_created),
    updatedAt: toIsoDatetime(raw.date_last_updated),
    raw,
  }
}
