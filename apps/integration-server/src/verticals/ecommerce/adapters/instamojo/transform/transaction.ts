/**
 * Instamojo Payment → canonical Transaction.
 *
 * Instamojo uses "Payment" to represent a completed monetary transfer.
 * Each payment is associated with a payment request. We map:
 *
 *   id                   ← payment.payment_id
 *   orderId              ← payment.payment_request.id (if present)
 *   kind                 ← always SALE (Instamojo processes direct sale payments)
 *   status               ← payment.status → TransactionStatus
 *   amount               ← payment.amount (INR major units → minor units)
 *   gateway              ← payment.instrument_type (CARD, UPI, NETBANKING, etc.)
 *   errorMessage         ← payment.failure.message (if failed)
 *   createdAt            ← payment.created_at (if present)
 *
 * Docs: https://docs.instamojo.com/reference/get-payment-details-1
 */

import type { Transaction, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawInstamojoPaymentFailure {
  reason?: string | null
  message?: string | null
}

export interface RawInstamojoPaymentRequestRef {
  id?: string
  [key: string]: unknown
}

export interface RawInstamojoPayment {
  payment_id: string
  status?: string | null
  amount?: string | number
  currency?: string
  instrument_type?: string | null
  billing_instrument?: string | null
  payout?: unknown
  failure?: RawInstamojoPaymentFailure | null
  payment_request?: RawInstamojoPaymentRequestRef | string | null
  fees?: string | number
  created_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

/**
 * Map Instamojo payment status to canonical TransactionStatus.
 *
 * Instamojo payment statuses (from docs):
 *  - Credit      → payment received
 *  - Failed      → payment failed
 *  - Pending     → payment initiated, not confirmed
 */
const STATUS_MAP: Record<string, TransactionStatus> = {
  Credit: 'SUCCESS',
  credit: 'SUCCESS',
  Failed: 'FAILURE',
  failed: 'FAILURE',
  Pending: 'PENDING',
  pending: 'PENDING',
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawInstamojoPayment): Transaction {
  const currency = raw.currency ?? 'INR'
  const amountNum = toNum(raw.amount)
  const amountMinor = majorToMinor(amountNum, currency)

  const status = raw.status ? STATUS_MAP[raw.status] ?? undefined : undefined

  // payment_request may be an object with an id, or a URL string, or null.
  let orderId: string | undefined
  if (raw.payment_request != null) {
    if (typeof raw.payment_request === 'object') {
      const ref = raw.payment_request as RawInstamojoPaymentRequestRef
      orderId = ref.id ?? undefined
    }
    // If it's a URL string (e.g. "https://api.instamojo.com/v2/payment_requests/xyz/"),
    // extract the last path segment.
    if (typeof raw.payment_request === 'string') {
      const parts = raw.payment_request.replace(/\/$/, '').split('/')
      orderId = parts[parts.length - 1] ?? undefined
    }
  }

  return {
    id: raw.payment_id,
    orderId,
    kind: 'SALE',
    status,
    amount:
      amountMinor != null ? { amount: amountMinor, currency } : undefined,
    // instrument_type = CARD, UPI, NETBANKING, WALLET, EMI
    gateway: raw.instrument_type ?? raw.billing_instrument ?? undefined,
    errorMessage: raw.failure?.message ?? undefined,
    errorCode: raw.failure?.reason ?? undefined,
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
