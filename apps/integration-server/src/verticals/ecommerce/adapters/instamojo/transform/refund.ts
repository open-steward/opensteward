/**
 * Instamojo Refund → canonical Refund.
 *
 * Instamojo supports partial refunds on payments. Each refund is tied to a
 * specific payment (not a payment request). We map:
 *
 *   id            ← refund.id
 *   orderId       ← refund.payment_id (the Instamojo payment this refund is for;
 *                   we use payment_id as the orderId because the canonical Refund
 *                   links back to the order/payment, not a payment request)
 *   amount        ← refund.refund_amount (INR major units → minor units)
 *   reason        ← refund.type (three-letter code) + body
 *   note          ← refund.body
 *   processedAt   ← refund.processed_at
 *   createdAt     ← refund.created_at
 *
 * Refund type codes (from Instamojo docs):
 *  RFD – Referee's decision
 *  TNR – Transaction not recognized
 *  QFL – Quality failure
 *  QNR – Item not received
 *  EWN – Excess amount received
 *  TAN – Transaction amount not correct
 *  PTH – Pass-through (manual)
 *
 * Docs: https://github.com/Instamojo/instamojo-py/blob/master/REFUNDS.md
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawInstamojoRefund {
  id: string
  payment_id?: string | null
  status?: string | null
  type?: string | null
  body?: string | null
  refund_amount?: string | number
  total_amount?: string | number
  currency?: string
  processed_at?: string | null
  created_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawInstamojoRefund): Refund {
  const currency = raw.currency ?? 'INR'
  // Use refund_amount if available, otherwise fall back to total_amount.
  const refundNum = toNum(raw.refund_amount ?? raw.total_amount)
  const amountMinor = majorToMinor(refundNum, currency)

  return {
    id: raw.id,
    // Instamojo refunds link to a payment, not a payment request.
    // We surface payment_id as orderId — callers can resolve the payment
    // to its payment request via the transactions resource.
    orderId: raw.payment_id ?? raw.id,
    amount:
      amountMinor != null && amountMinor > 0 ? { amount: amountMinor, currency } : undefined,
    reason: raw.type ?? undefined,
    note: raw.body ?? undefined,
    processedAt: toIsoDatetime(raw.processed_at),
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Refund → Instamojo refund body (for create).
 *
 * Required by Instamojo:
 *  - type          Three-letter refund code (default PTH = pass-through)
 *  - body          Human-readable reason
 *  - refund_amount Optional; omit for full refund
 */
export function untransformRefund(
  refund: Partial<Refund>,
): Record<string, string | number | undefined> {
  // Convert minor units back to major units for Instamojo using currency-aware divisor.
  const currency = refund.amount?.currency ?? 'INR'
  const majorAmount = minorToMajor(refund.amount?.amount, currency)
  const refundAmountMajor = majorAmount != null ? majorAmount.toFixed(2) : undefined

  return {
    type: refund.reason ?? 'PTH',
    body: refund.note ?? refund.reason ?? 'Refund',
    refund_amount: refundAmountMajor,
  }
}
