/**
 * eBay Refund → canonical Refund.
 *
 * eBay supports creating refunds via:
 *   POST /sell/fulfillment/v1/order/{orderId}/issue_refund
 *
 * For listing refunds, we derive refund info from the order's payment
 * summary (refundedAmount field). eBay does not expose a standalone
 * list-refunds endpoint, so refunds are projected from order data.
 *
 * Refund id format: `${orderId}:refund` — eBay doesn't surface a
 * separate refund id for order-level refunds.
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawEbayMoney {
  value: string
  currency: string
}

export interface RawEbayRefund {
  orderId: string
  refundAmount?: RawEbayMoney
  reasonForRefund?: string
  comment?: string
  refundDate?: string
  refundId?: string
  refundStatus?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(m: RawEbayMoney | undefined):
  | { amount: number; currency: string }
  | undefined {
  if (!m) return undefined
  const n = parseFloat(m.value)
  if (Number.isNaN(n)) return undefined
  return { amount: majorToMinor(n, m.currency), currency: m.currency }
}

/** Integer minor units → major-unit decimal string for upstream payloads. */
function minorToMajorString(amount: number, currency: string): string {
  const exponent = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, XOF: 0, XAF: 0,
    PYG: 0, UGX: 0, RWF: 0, BHD: 3, KWD: 3, OMR: 3, TND: 3, JOD: 3, IQD: 3,
    LYD: 3 }[currency.toUpperCase()] ?? 2
  return (amount / 10 ** exponent).toFixed(exponent)
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawEbayRefund): Refund {
  const amount = toMoney(raw.refundAmount)
  const id = raw.refundId ?? `${raw.orderId}:refund`

  return {
    id,
    orderId: raw.orderId,
    amount,
    reason: raw.reasonForRefund,
    note: raw.comment,
    processedAt: raw.refundDate,
    createdAt: raw.refundDate,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Refund → eBay issue_refund body.
 */
export function untransformRefund(data: Partial<Refund>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.amount) {
    body['reasonForRefund'] = data.reason ?? 'OTHER'
    body['comment'] = data.note ?? ''
    body['orderLevelRefundAmount'] = {
      value: minorToMajorString(data.amount.amount, data.amount.currency),
      currency: data.amount.currency,
    }
  }
  return body
}
