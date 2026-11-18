/**
 * Facebook Commerce Refund → canonical Refund.
 *
 * Facebook Commerce API supports refunds via:
 *   GET /{order_id}/refunds → list refunds for an order
 *   POST /{order_id}/refunds → create a refund
 *
 * Refunds contain amount, reason, and item references.
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

const ZERO_DECIMAL = new Set([
  'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'XOF', 'XAF', 'PYG', 'UGX', 'RWF',
])
const THREE_DECIMAL = new Set(['BHD', 'KWD', 'OMR', 'TND', 'JOD', 'IQD', 'LYD'])

/** Integer minor units → major-unit decimal string for upstream payloads. */
function minorToMajorString(amount: number, currency: string): string {
  const c = currency.toUpperCase()
  const exponent = ZERO_DECIMAL.has(c) ? 0 : THREE_DECIMAL.has(c) ? 3 : 2
  return (amount / 10 ** exponent).toFixed(exponent)
}

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawFacebookMoney {
  amount: string
  currency: string
}

export interface RawFacebookRefundItem {
  item_id: string
  item_refund_amount?: RawFacebookMoney
  item_refund_quantity?: number
}

export interface RawFacebookRefund {
  id: string
  order_id?: string
  refund_amount?: RawFacebookMoney
  refund_reason?: string
  reason_text?: string
  items?: RawFacebookRefundItem[]
  created_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(m: RawFacebookMoney | undefined):
  | { amount: number; currency: string }
  | undefined {
  if (!m) return undefined
  const n = parseFloat(m.amount)
  if (Number.isNaN(n)) return undefined
  return { amount: majorToMinor(n, m.currency), currency: m.currency }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawFacebookRefund): Refund {
  const amount = toMoney(raw.refund_amount)

  return {
    id: raw.id,
    orderId: raw.order_id ?? '',
    amount,
    reason: raw.refund_reason,
    note: raw.reason_text,
    processedAt: raw.created_at,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Refund → Facebook create refund body.
 */
export function untransformRefund(data: Partial<Refund>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.reason) body['reason_code'] = data.reason
  if (data.note) body['reason_text'] = data.note

  if (data.amount) {
    body['refund_amount'] = {
      amount: minorToMajorString(data.amount.amount, data.amount.currency),
      currency: data.amount.currency,
    }
  }

  // Pass through items from metadata if present
  const items = data.metadata?.['items'] as unknown[] | undefined
  if (items) body['items'] = items

  return body
}
