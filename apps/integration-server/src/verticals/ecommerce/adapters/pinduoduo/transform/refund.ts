/**
 * Pinduoduo after-sales (refund) record → canonical Refund.
 *
 * PDD returns after-sales data from `pdd.refund.list.increment.get`
 * (incremental list keyed by an update-time window) and
 * `pdd.refund.information.get` (single record by `refund_id`). The raw field
 * names below follow the same `<method>.information.get` → `<entity>_info` /
 * `<method>.list...get` → `<entity>_list` convention already used for orders
 * (`order_info`/`order_list`) and goods (`goods_detail`/`goods_list`)
 * elsewhere in this adapter — PDD's per-method field docs for the refund
 * methods returned only "System Error" at verification time, so these are the
 * best available inference, not confirmed against a live response.
 *
 * Amounts are integers in fen (Chinese cents), same convention as orders and
 * goods. Canonical Refund has no status field, so `after_sales_status` is
 * kept on the raw record (surfaced via `metadata`) but not mapped.
 */

import type { Refund } from '../../../schema/refund'
import { fenAsMinorUnits, unixToIso } from './product'

// ── Raw shape ─────────────────────────────────────────────────────────────────

export interface RawPddRefund {
  /** After-sales (refund) identifier — the canonical Refund id. */
  refund_id?: string | number
  /** Order serial number this after-sales request belongs to. */
  order_sn?: string
  /** Refund amount in fen (Chinese cents). */
  refund_amount?: number
  /** Buyer-submitted reason for the after-sales request. */
  refund_reason?: string
  /** After-sales status code (not mapped — canonical Refund carries no status). */
  after_sales_status?: number
  /** Creation timestamp (Unix seconds). */
  created_time?: number
  /** Last-updated timestamp (Unix seconds). */
  updated_time?: number
  /** Timestamp the refund completed (Unix seconds), once finished. */
  success_time?: number
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * PDD after-sales record → canonical Refund.
 *
 * `refund_id` becomes the canonical `id`; `order_sn` becomes `orderId`. The
 * complete raw record is stored in `metadata`.
 */
export function transformRefund(raw: RawPddRefund, currency = 'CNY'): Refund {
  return {
    id: String(raw.refund_id ?? ''),
    orderId: raw.order_sn ?? '',
    amount:
      raw.refund_amount != null
        ? { amount: fenAsMinorUnits(raw.refund_amount), currency }
        : undefined,
    reason: raw.refund_reason ?? undefined,
    processedAt: unixToIso(raw.success_time) ?? unixToIso(raw.updated_time),
    createdAt: unixToIso(raw.created_time),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
