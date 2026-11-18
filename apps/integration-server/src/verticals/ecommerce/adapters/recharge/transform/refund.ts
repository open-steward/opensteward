/**
 * Recharge Charge refund → canonical Refund.
 *
 * Recharge does not have a dedicated `/refunds` REST resource. Refunds are
 * surfaced as charge status transitions (`refunded` / `partially_refunded`).
 * The adapter maps a refunded charge object to the canonical Refund shape so
 * that downstream consumers can work with a uniform interface.
 *
 * Recharge exposes `total_refunds` on the charge object and the charge status
 * (`refunded` / `partially_refunded`) tells us the state. We store the charge
 * id as both the refund id and orderId so round-trip lookups work.
 *
 * Docs: https://developer.rechargepayments.com/2021-11/charges/charge_object
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Recharge shapes ──────────────────────────────────────────────────────

export interface RawRechargeRefund {
  /** Charge id that was refunded — used as the refund id. */
  id: number | string
  /** Parent order id (if this refund is associated with a specific order). */
  order_id?: number | string | null
  /** Refund amount as decimal major units string, e.g. "19.99". */
  total_refunds?: string | number | null
  currency?: string | null
  note?: string | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

export function transformRefund(raw: RawRechargeRefund, orderId: string): Refund {
  const currency = raw.currency ?? 'USD'
  const refundAmountMajor = toNum(raw.total_refunds)
  const amount =
    refundAmountMajor > 0
      ? { amount: majorToMinor(refundAmountMajor, currency), currency }
      : undefined

  return {
    id: String(raw.id),
    orderId,
    amount,
    reason: raw.note ?? undefined,
    restock: false,
    processedAt: toIsoDatetime(raw.updated_at ?? raw.created_at),
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
