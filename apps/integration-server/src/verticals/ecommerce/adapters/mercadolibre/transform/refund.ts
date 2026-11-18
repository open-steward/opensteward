/**
 * Mercado Libre Payment → canonical Refund.
 *
 * Mercado Libre handles refunds through the payments API:
 *   POST /v1/payments/{paymentId}/refunds → create
 *
 * For listing refunds, we derive refund info from order payment statuses.
 * ML does not expose a standalone list-refunds endpoint at the order level,
 * so refunds are projected from payment data.
 *
 * Refund id format: `${orderId}:${paymentId}:refund`.
 */

import type { Refund } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawMeliRefund {
  orderId: string
  paymentId: number
  amount?: number
  currency_id?: string
  reason?: string
  date_created?: string
  status?: string
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawMeliRefund): Refund {
  const id = `${raw.orderId}:${raw.paymentId}:refund`
  const amount =
    raw.amount != null && raw.currency_id
      ? { amount: raw.amount, currency: raw.currency_id }
      : undefined

  return {
    id,
    orderId: raw.orderId,
    amount,
    reason: raw.reason,
    processedAt: toIsoDatetime(raw.date_created),
    createdAt: toIsoDatetime(raw.date_created),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Refund → Mercado Libre refund body (POST /v1/payments/{id}/refunds).
 */
export function untransformRefund(data: Partial<Refund>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.amount) {
    body['amount'] = data.amount.amount
  }
  return body
}
