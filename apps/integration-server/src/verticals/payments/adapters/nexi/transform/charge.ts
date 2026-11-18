/**
 * Maps a Nexi Checkout (Nets Easy) **payment** onto the canonical `Charge`.
 *
 * Nexi has no standalone "charge of money" object that lines up 1:1 with the
 * canonical charge: a payment is reserved, then charged (captured), refunded
 * and/or cancelled. The `summary` block carries the running minor-unit totals
 * (reservedAmount / chargedAmount / refundedAmount / cancelledAmount) from
 * which we derive the canonical amount + status.
 *
 * GET /v1/payments/{paymentId} returns `{ payment: { … } }`; the adapter unwraps
 * the envelope before calling this transform.
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toIsoDatetime, type NexiAmount } from './shared'

export interface RawNexiSummary {
  reservedAmount?: number
  chargedAmount?: number
  refundedAmount?: number
  cancelledAmount?: number
}

export interface RawNexiOrderDetails {
  amount?: number
  currency?: string
  reference?: string
}

export interface RawNexiPaymentDetails {
  paymentType?: string
  paymentMethod?: string
  cardDetails?: { maskedPan?: string; expiryDate?: string }
}

export interface RawNexiConsumer {
  email?: string
  phoneNumber?: { prefix?: string; number?: string } | string
  privatePerson?: { firstName?: string; lastName?: string; email?: string }
  company?: { name?: string }
}

export interface RawNexiPayment {
  paymentId?: string
  summary?: RawNexiSummary
  orderDetails?: RawNexiOrderDetails
  paymentDetails?: RawNexiPaymentDetails
  consumer?: RawNexiConsumer
  /** Top-level amount echoed by some create-charge responses. */
  amount?: NexiAmount
  created?: string
  charged?: string
  refunds?: unknown[]
  charges?: unknown[]
  terminated?: string
  myReference?: string
  [k: string]: unknown
}

/**
 * Derive a canonical lifecycle status from the `summary` totals. Nexi does not
 * expose a single status enum on the payment, so we reconstruct it:
 *   chargedAmount fully refunded → refunded; partially → partially_refunded;
 *   chargedAmount > 0           → succeeded;
 *   terminated/cancelled        → cancelled;
 *   otherwise (reserved only)   → pending.
 */
function mapStatus(raw: RawNexiPayment): ChargeStatus {
  const s = raw.summary ?? {}
  const reserved = s.reservedAmount ?? 0
  const charged = s.chargedAmount ?? 0
  const refunded = s.refundedAmount ?? 0
  const cancelled = s.cancelledAmount ?? 0

  if (charged > 0 && refunded >= charged) return 'refunded'
  if (refunded > 0) return 'partially_refunded'
  if (charged > 0) return 'succeeded'
  if (raw.terminated || (cancelled > 0 && charged === 0)) return 'cancelled'
  if (reserved > 0) return 'pending'
  return 'pending'
}

function consumerEmail(c: RawNexiConsumer | undefined): string | undefined {
  return c?.email ?? c?.privatePerson?.email
}

export function transformCharge(raw: RawNexiPayment): Charge {
  const id = raw.paymentId ?? ''
  const summary = raw.summary ?? {}
  const order = raw.orderDetails ?? {}
  // Prefer the reserved/order amount as the canonical gross; fall back to a
  // top-level amount envelope (create-charge responses) then 0.
  const amount = order.amount ?? summary.reservedAmount ?? raw.amount?.amount ?? 0
  const currency = pickCurrency(order.currency ?? raw.amount?.currency)

  const meta: Record<string, unknown> = {
    reference: order.reference,
    myReference: raw.myReference,
    paymentType: raw.paymentDetails?.paymentType,
    paymentMethod: raw.paymentDetails?.paymentMethod,
    maskedPan: raw.paymentDetails?.cardDetails?.maskedPan,
  }

  return {
    id: String(id),
    externalId: String(id),
    amount,
    currency,
    amountRefunded: summary.refundedAmount ?? 0,
    amountCaptured: summary.chargedAmount ?? 0,
    status: mapStatus(raw),
    captured: (summary.chargedAmount ?? 0) > 0,
    capturedAt: toIsoDatetime(raw.charged),
    description: order.reference,
    receiptEmail: consumerEmail(raw.consumer),
    gateway: 'nexi',
    metadata: strMap(meta),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.terminated ?? raw.charged ?? raw.created),
    raw,
  }
}
