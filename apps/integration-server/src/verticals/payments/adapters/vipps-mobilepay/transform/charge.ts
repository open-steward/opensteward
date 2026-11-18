/**
 * Maps a Vipps MobilePay ePayment **payment** onto the canonical `Charge`.
 *
 * Vipps has no standalone "charge of money" object that lines up 1:1 with the
 * canonical charge: a payment is created, authorized (reserved), captured,
 * refunded and/or cancelled. The `aggregate` block carries running minor-unit
 * totals (authorizedAmount / capturedAmount / refundedAmount / cancelledAmount)
 * from which we derive the canonical amount + status, alongside the lifecycle
 * `state` enum (CREATED / AUTHORIZED / TERMINATED / ABORTED / EXPIRED).
 *
 * `GET /epayment/v1/payments/{reference}` returns the payment object directly
 * (no envelope).
 *
 * Docs: https://developer.vippsmobilepay.com/api/epayment
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, type VippsAmount } from './shared'

export interface RawVippsAggregate {
  authorizedAmount?: VippsAmount
  cancelledAmount?: VippsAmount
  capturedAmount?: VippsAmount
  refundedAmount?: VippsAmount
}

export interface RawVippsPaymentMethod {
  type?: string
  cardBin?: string
}

export interface RawVippsProfile {
  sub?: string
}

export interface RawVippsPayment {
  /** Merchant-chosen idempotent payment id; the canonical charge id. */
  reference?: string
  /** Vipps-assigned id for the payment operation. */
  pspReference?: string
  /** Lifecycle: CREATED | AUTHORIZED | TERMINATED | ABORTED | EXPIRED. */
  state?: string
  amount?: VippsAmount
  aggregate?: RawVippsAggregate
  paymentMethod?: RawVippsPaymentMethod
  profile?: RawVippsProfile
  paymentDescription?: string
  /** Some webhook-driven reads echo a `name` (CAPTURED/REFUNDED/…). */
  name?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

/**
 * Derive a canonical lifecycle status. Vipps exposes both a coarse `state`
 * enum and fine-grained `aggregate` totals; the totals win when present
 * because they distinguish captured / refunded / partially-refunded, which the
 * state enum collapses into `AUTHORIZED`.
 *
 *   captured fully refunded            → refunded
 *   captured partially refunded        → partially_refunded
 *   captured > 0                       → succeeded
 *   TERMINATED / ABORTED / cancelled   → cancelled
 *   EXPIRED                            → failed
 *   AUTHORIZED (reserved, not captured)→ pending
 *   otherwise (CREATED)                → pending
 */
function mapStatus(raw: RawVippsPayment): ChargeStatus {
  const agg = raw.aggregate ?? {}
  const authorized = agg.authorizedAmount?.value ?? 0
  const captured = agg.capturedAmount?.value ?? 0
  const refunded = agg.refundedAmount?.value ?? 0
  const cancelled = agg.cancelledAmount?.value ?? 0
  const state = (raw.state ?? '').toUpperCase()

  if (captured > 0 && refunded >= captured) return 'refunded'
  if (refunded > 0) return 'partially_refunded'
  if (captured > 0) return 'succeeded'
  if (state === 'TERMINATED' || state === 'ABORTED' || (cancelled > 0 && captured === 0)) {
    return 'cancelled'
  }
  if (state === 'EXPIRED') return 'failed'
  if (state === 'AUTHORIZED' || authorized > 0) return 'pending'
  return 'pending'
}

export function transformCharge(raw: RawVippsPayment): Charge {
  const reference = raw.reference ?? ''
  const agg = raw.aggregate ?? {}
  // Prefer the order/authorized amount as the canonical gross; fall back to the
  // top-level amount envelope then 0.
  const grossAmount = raw.amount?.value ?? agg.authorizedAmount?.value ?? 0
  const currency = pickCurrency(raw.amount?.currency ?? agg.authorizedAmount?.currency)
  const captured = agg.capturedAmount?.value ?? 0

  const meta: Record<string, unknown> = {
    pspReference: raw.pspReference,
    state: raw.state,
    paymentMethodType: raw.paymentMethod?.type,
    cardBin: raw.paymentMethod?.cardBin,
  }

  return {
    id: String(reference),
    externalId: String(reference),
    amount: grossAmount,
    currency,
    amountRefunded: agg.refundedAmount?.value ?? 0,
    amountCaptured: captured,
    status: mapStatus(raw),
    captured: captured > 0,
    customerId: raw.profile?.sub ?? undefined,
    description: raw.paymentDescription,
    gateway: 'vipps-mobilepay',
    metadata: strMap({ ...raw.metadata, ...meta }),
    raw,
  }
}
