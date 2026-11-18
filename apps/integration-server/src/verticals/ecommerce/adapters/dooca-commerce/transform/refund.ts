/**
 * Dooca Commerce Refund → canonical Refund.
 *
 * Dooca does not expose a dedicated refund list endpoint. Refund information
 * is inferred from the order's `payment_status` ("refunded" | "chargeback")
 * and the order history (`histories[]`). For creating refunds, Dooca expects
 * you to update the order's payment status.
 *
 * For the canonical adapter shape we construct a minimal Refund record from
 * the order total when the payment_status indicates a refund has occurred.
 * The `order_id` is always required.
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

const CURRENCY = 'BRL'

export interface RawDoocaRefund {
  id: number | string
  order_id: number | string
  amount?: string | number | null
  reason?: string | null
  note?: string | null
  created_at?: string
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

export function transformRefund(raw: RawDoocaRefund, orderId?: string): Refund {
  const resolvedOrderId = orderId ?? (raw.order_id != null ? String(raw.order_id) : '')
  const amt = toNum(raw.amount)
  return {
    id: String(raw.id),
    orderId: resolvedOrderId,
    amount:
      Number.isFinite(amt) && amt > 0
        ? { amount: majorToMinor(amt, CURRENCY), currency: CURRENCY }
        : undefined,
    reason: raw.reason ?? undefined,
    note: raw.note ?? undefined,
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → Dooca refund body (for create). */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    note: refund.note,
    reason: refund.reason,
    amount:
      refund.amount?.amount != null
        ? (refund.amount.amount / 100).toFixed(2)
        : undefined,
  }
}
