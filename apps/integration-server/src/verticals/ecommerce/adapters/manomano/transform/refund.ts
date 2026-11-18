/**
 * ManoMano Refund → canonical Refund.
 *
 * ManoMano allows sellers to request refunds for order lines. The refund
 * resource shape:
 *
 *   {
 *     id: string,
 *     order_id: string,
 *     reason: string,
 *     note: string | null,
 *     amount: number,         // major units (e.g. 19.99 EUR)
 *     currency: string,
 *     refund_lines: [
 *       {
 *         order_line_id: string,
 *         quantity: number,
 *         amount: number      // major units
 *       }
 *     ],
 *     created_at: string,
 *     processed_at: string | null
 *   }
 *
 * Docs: https://www.manomano.dev/
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw ManoMano shapes ──────────────────────────────────────────────────────

export interface RawManomanoRefundLine {
  order_line_id: string | number
  quantity: number
  amount?: number | null
}

export interface RawManomanoRefund {
  id: string | number
  order_id: string | number
  reason?: string | null
  note?: string | null
  amount?: number | null
  currency?: string
  refund_lines?: RawManomanoRefundLine[]
  created_at?: string
  processed_at?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapRefundLines(
  raw: RawManomanoRefundLine[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: String(li.order_line_id),
    quantity: li.quantity,
    amount:
      li.amount != null
        ? { amount: majorToMinor(li.amount, currency), currency }
        : undefined,
  }))
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformRefund(raw: RawManomanoRefund): Refund {
  const currency = raw.currency ?? 'EUR'
  return {
    id: String(raw.id),
    orderId: String(raw.order_id),
    amount:
      raw.amount != null
        ? { amount: majorToMinor(raw.amount, currency), currency }
        : undefined,
    note: raw.note ?? raw.reason ?? undefined,
    refundLineItems: mapRefundLines(raw.refund_lines, currency),
    processedAt: toIsoDatetime(raw.processed_at),
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → ManoMano refund request body. */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    note: refund.note,
    refund_lines: refund.refundLineItems?.map((li) => ({
      order_line_id: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
