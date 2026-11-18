/**
 * Tmall / TOP refund → canonical Refund.
 *
 * TOP exposes refunds via `taobao.refunds.receive.get` (list of refunds the
 * seller has received) and `taobao.refund.get` (single refund by refund_id).
 *
 * Key TOP refund status values:
 *   WAIT_SELLER_AGREE         – buyer requested; awaiting seller response
 *   WAIT_BUYER_RETURN_GOODS   – seller agreed to return; awaiting goods
 *   WAIT_SELLER_CONFIRM_GOODS – goods in transit back to seller
 *   SELLER_REFUSE_BUYER       – seller refused refund
 *   CLOSED                    – refund closed (e.g. buyer withdrew request)
 *   SUCCESS                   – refund completed
 *
 * The canonical `id` is `refund_id` (a string from TOP).
 * The associated trade id `tid` maps to `orderId`.
 * `refund_fee` is a CNY decimal string (e.g. "98.00") and is left as-is
 * because the canonical MoneySchema takes a number amount.
 */

import type { Refund } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawTmallRefund {
  /** TOP refund identifier. */
  refund_id?: string | number
  /** Associated trade (order) id. */
  tid?: string | number
  /** Associated sub-order id. */
  oid?: string | number
  /** Buyer's Taobao username. */
  buyer_nick?: string
  /** Seller's Taobao username. */
  seller_nick?: string
  /** Total trade fee (original order amount, CNY decimal string). */
  total_fee?: string
  /** Refund amount (CNY decimal string, e.g. "98.00"). */
  refund_fee?: string
  /** Alipay transaction number for the refund. */
  alipay_no?: string
  /** Refund status (see comment above). */
  status?: string
  /** Refund reason text provided by the buyer. */
  reason?: string
  /** Additional description/notes for the refund. */
  desc?: string
  /** Whether the buyer needs to return goods ("true"/"false"). */
  has_good_return?: boolean | string
  /** Item title. */
  title?: string
  /** Item num_iid. */
  num_iid?: string | number
  /** Quantity. */
  num?: number
  /** Creation time (yyyy-MM-dd HH:mm:ss). */
  created?: string
  /** Last modified time (yyyy-MM-dd HH:mm:ss). */
  modified?: string
  /** Good return time (when goods were returned). */
  good_return_time?: string
  /** Logistics company name (if goods returned). */
  company_name?: string
  /** Logistics waybill number. */
  sid?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAmount(val: string | number | undefined): number {
  if (val == null) return 0
  const n = typeof val === 'number' ? val : parseFloat(val)
  return Number.isNaN(n) ? 0 : n
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * TOP refund → canonical Refund.
 *
 * `refund_id` → canonical `id`.
 * `tid`       → canonical `orderId`.
 * `refund_fee` (CNY decimal string) → `amount.amount` (number, CNY).
 */
export function transformRefund(raw: RawTmallRefund, currency = 'CNY'): Refund {
  const refundFee = parseAmount(raw.refund_fee)

  const hasGoodReturn =
    typeof raw.has_good_return === 'boolean'
      ? raw.has_good_return
      : raw.has_good_return === 'true'

  return {
    id: String(raw.refund_id ?? ''),
    orderId: String(raw.tid ?? ''),
    amount:
      refundFee > 0
        ? { amount: refundFee, currency }
        : undefined,
    reason: raw.reason ?? undefined,
    note: raw.desc ?? undefined,
    restock: hasGoodReturn,
    processedAt: toIsoDatetime(raw.good_return_time ?? raw.modified),
    createdAt: toIsoDatetime(raw.created),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Transform a list of TOP refunds.
 */
export function transformRefunds(
  rawList: RawTmallRefund[] | undefined,
  currency = 'CNY',
): Refund[] {
  if (!rawList || rawList.length === 0) return []
  return rawList.map((r) => transformRefund(r, currency))
}
