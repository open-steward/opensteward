/**
 * Airwallex is PaymentIntent-centric: a **PaymentIntent** carries the amount,
 * currency, customer and overall payment status, so it maps onto the canonical
 * **Charge**. The intent's `latest_payment_attempt` holds the gateway-level
 * authorisation; we surface its id as the `paymentMethodId` hint.
 *
 * Money is in **major units** (e.g. `16.66`) and must be scaled to minor units.
 * Timestamps look like `2023-01-13T07:32:05+0000` and are coerced to strict
 * ISO-8601 via `toIsoDatetime`.
 *
 * Refs:
 *   https://www.airwallex.com/docs/api/payments/payment_intents
 *   https://www.airwallex.com/docs/payments/reference/payment-statuses
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawAirwallexPaymentAttempt {
  id?: string
  amount?: number
  currency?: string
  status?: string
  captured_amount?: number
  refunded_amount?: number
  payment_method?: { id?: string; type?: string } & Record<string, unknown>
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

export interface RawAirwallexPaymentIntent {
  id?: string
  request_id?: string
  amount?: number
  currency?: string
  status?: string
  captured_amount?: number
  refunded_amount?: number
  customer_id?: string
  merchant_order_id?: string
  descriptor?: string
  latest_payment_attempt?: RawAirwallexPaymentAttempt
  created_at?: string
  updated_at?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

/**
 * PaymentIntent statuses (uppercase): REQUIRES_PAYMENT_METHOD,
 * REQUIRES_CUSTOMER_ACTION, REQUIRES_CAPTURE, PENDING, AUTHORIZED, SUCCEEDED,
 * CANCELLED, EXPIRED, FAILED. We refine SUCCEEDED into partially_refunded /
 * refunded using the refunded amount.
 */
function mapStatus(raw: RawAirwallexPaymentIntent): ChargeStatus {
  const status = (raw.status ?? '').toUpperCase()
  const captured = raw.captured_amount ?? 0
  const refunded = raw.refunded_amount ?? raw.latest_payment_attempt?.refunded_amount ?? 0
  if (status === 'SUCCEEDED' || status === 'AUTHORIZED') {
    if (refunded > 0 && captured > 0 && refunded >= captured) return 'refunded'
    if (refunded > 0) return 'partially_refunded'
    return 'succeeded'
  }
  switch (status) {
    case 'FAILED':
      return 'failed'
    case 'CANCELLED':
    case 'EXPIRED':
      return 'cancelled'
    case 'REQUIRES_PAYMENT_METHOD':
    case 'REQUIRES_CUSTOMER_ACTION':
    case 'REQUIRES_CAPTURE':
    case 'PENDING':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawAirwallexPaymentIntent): Charge {
  const attempt = raw.latest_payment_attempt
  const status = (raw.status ?? '').toUpperCase()
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: toMinorUnits(raw.amount) ?? 0,
    currency: pickCurrency(raw.currency),
    amountCaptured: toMinorUnits(raw.captured_amount),
    amountRefunded: toMinorUnits(raw.refunded_amount ?? attempt?.refunded_amount),
    status: mapStatus(raw),
    captured: status === 'SUCCEEDED' ? true : undefined,
    customerId: raw.customer_id,
    paymentMethodId: attempt?.payment_method?.id ?? attempt?.id,
    statementDescriptor: raw.descriptor,
    gateway: 'airwallex',
    metadata: strMap({ ...raw.metadata, merchant_order_id: raw.merchant_order_id }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
