/**
 * Instamojo PaymentRequest → canonical Order.
 *
 * Instamojo does not have a traditional "order" resource in the ecommerce
 * sense. The closest equivalent is a Payment Request, which represents a
 * request for money from a buyer. We map it to the canonical Order shape:
 *
 *   id              ← payment_request.id
 *   orderNumber     ← payment_request.id (no numeric order number)
 *   name            ← payment_request.purpose (the reason / title)
 *   email           ← payment_request.email
 *   phone           ← payment_request.phone
 *   totalPrice      ← payment_request.amount (INR, major units → minor units)
 *   financialStatus ← derived from payment_request.status
 *   createdAt       ← payment_request.created_at
 *   updatedAt       ← payment_request.modified_at
 *
 * Docs: https://docs.instamojo.com/reference/create-a-payment-request-1
 */

import type { Order, OrderFinancialStatus } from '../../../schema/order'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawInstamojoPayment {
  payment_id?: string
  quantity?: number
  status?: string
  link_slug?: string
  [key: string]: unknown
}

export interface RawInstamojoPaymentRequest {
  id: string
  user?: string
  phone?: string | null
  email?: string | null
  buyer_name?: string | null
  amount?: string | number
  purpose?: string | null
  status?: string | null
  payments?: RawInstamojoPayment[]
  send_sms?: boolean
  send_email?: boolean
  sms_status?: string | null
  email_status?: string | null
  shorturl?: string | null
  longurl?: string | null
  redirect_url?: string | null
  webhook?: string | null
  allow_repeated_payments?: boolean
  mark_fulfilled?: boolean | null
  expires_at?: string | null
  created_at?: string
  modified_at?: string
  currency?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

/**
 * Map Instamojo payment request status to canonical OrderFinancialStatus.
 *
 * Instamojo statuses:
 *  - Pending   → payment form not yet visited / email not sent
 *  - Sent      → email/sms dispatched, awaiting payment
 *  - Failed    → delivery failure (not payment failure)
 *  - Completed → at least one payment was completed
 */
const STATUS_MAP: Record<string, OrderFinancialStatus> = {
  Pending: 'PENDING',
  pending: 'PENDING',
  Sent: 'PENDING',
  sent: 'PENDING',
  Failed: 'PENDING',
  failed: 'PENDING',
  Completed: 'PAID',
  completed: 'PAID',
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Transform an Instamojo PaymentRequest into a canonical Order.
 * Currency defaults to INR (Instamojo processes INR by default).
 */
export function transformOrder(raw: RawInstamojoPaymentRequest): Order {
  const currency = raw.currency ?? 'INR'
  const amountNum = toNum(raw.amount)
  const amountMinor = majorToMinor(amountNum, currency)

  const financialStatus = raw.status ? STATUS_MAP[raw.status] ?? undefined : undefined

  // Surface linked payment IDs as transactionIds.
  const transactionIds =
    raw.payments && raw.payments.length > 0
      ? raw.payments.map((p) => p.payment_id ?? '').filter(Boolean)
      : undefined

  return {
    id: raw.id,
    orderNumber: raw.id,
    name: raw.purpose ?? undefined,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    currency,
    totalPrice:
      amountMinor != null ? { amount: amountMinor, currency } : undefined,
    financialStatus,
    note: raw.purpose ?? undefined,
    transactionIds,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.modified_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Order → Instamojo payment request body (for create).
 * Instamojo requires `purpose` and `amount` in major units (e.g. 499.00).
 */
export function untransformOrder(
  order: Partial<Order>,
): Record<string, string | number | boolean | undefined> {
  // totalPrice.amount is in minor units → convert to major units using currency-aware divisor.
  const currency = order.totalPrice?.currency ?? order.currency ?? 'INR'
  const majorAmount = minorToMajor(order.totalPrice?.amount, currency)
  const amountMajor = majorAmount != null ? majorAmount.toFixed(2) : undefined

  return {
    purpose: order.name ?? order.note ?? 'Payment',
    amount: amountMajor,
    email: order.email,
    phone: order.phone,
    send_email: false,
    send_sms: false,
  }
}
