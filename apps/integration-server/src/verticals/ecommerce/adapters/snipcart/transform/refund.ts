/**
 * Snipcart Refund → canonical Refund.
 *
 * Snipcart refunds belong to a specific order identified by `token`.
 * A refund has a GUID `id`, a major-unit decimal `amount`, and an optional
 * `comment` (mapped to canonical `note`).
 *
 * Docs: https://docs.snipcart.com/v3/api-reference/refunds
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw Snipcart shape ────────────────────────────────────────────────────────

export interface RawSnipcartRefund {
  id: string
  /** The order `token` this refund belongs to. */
  orderToken?: string
  /** Major-unit decimal refund amount (e.g. 19.99). */
  amount?: number | null
  comment?: string | null
  refundedByPaymentGateway?: boolean
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformRefund(
  raw: RawSnipcartRefund,
  orderToken: string,
  currency: string = 'USD',
): Refund {
  return {
    id: raw.id,
    orderId: orderToken,
    amount:
      raw.amount != null && raw.amount > 0
        ? { amount: majorToMinor(raw.amount, currency), currency }
        : undefined,
    note: raw.comment ?? undefined,
    restock: undefined,
    refundLineItems: undefined,
    transactionIds: undefined,
    processedAt: undefined,
    createdAt: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → Snipcart refund body (for create). */
export function untransformRefund(
  refund: Partial<Refund>,
  currency: string = 'USD',
): Record<string, unknown> {
  return {
    amount:
      refund.amount != null
        ? minorToMajor(refund.amount.amount, currency)
        : undefined,
    comment: refund.note,
  }
}
