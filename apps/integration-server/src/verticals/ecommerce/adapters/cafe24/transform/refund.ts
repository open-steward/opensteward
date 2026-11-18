/**
 * Cafe24 refund → canonical Refund.
 *
 * Refunds are their own resource, keyed by `refund_code`:
 *
 *   GET /api/v2/admin/refunds                 → { refunds: [...] }   (list row)
 *   GET /api/v2/admin/refunds/{refund_code}   → { refund: {...} }    (detail)
 *
 * The two responses document different amount fields, so each has its own
 * transform over a shared core.
 *
 * List row (https://apidocs.cafe24.com/en/docs/admin/get-refunds):
 *   order_id "Order ID", refund_code "refund number", accepted_refund_date
 *   "refund requested date", refund_date "refund completed date",
 *   actual_refund_amount "actual amount refunded", currency "Currency",
 *   status "status of refund T: Refunded. F: Awaiting refund",
 *   order_item_code "list of item codes".
 *
 * Detail (https://apidocs.cafe24.com/en/docs/admin/get-refunds-by-refund-code):
 *   order_id, refund_code, currency, accepted_refund_date, refund_date, status,
 *   refund_amount "refund amount", refund_reason "refund reason".
 *
 * Amounts are documented as numbers and exampled as decimal strings
 * ("12610.00"); either is read. An amount is emitted only with its currency.
 * The list row's `quantity` is one number for the whole refund, not per item
 * code, so no refund line items are built from it. Refund bank account fields
 * are personal data with no canonical field and are not copied.
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Cafe24 shapes ─────────────────────────────────────────────────────────

interface RawCafe24RefundCore {
  shop_no?: number | null
  order_id: string
  refund_code: string
  currency?: string | null
  accepted_refund_date?: string | null
  refund_date?: string | null
  status?: string | null
}

/** One row of `GET /refunds`. */
export interface RawCafe24RefundRow extends RawCafe24RefundCore {
  actual_refund_amount?: number | string | null
  order_item_code?: string[] | null
}

/** The `refund` of `GET /refunds/{refund_code}`. */
export interface RawCafe24RefundDetail extends RawCafe24RefundCore {
  refund_amount?: number | string | null
  refund_reason?: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function decimal(v: number | string | null | undefined): number | undefined {
  if (v == null || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : undefined
}

function core(raw: RawCafe24RefundCore, amount: number | string | null | undefined): Refund {
  const metadata: Record<string, unknown> = { refundCode: raw.refund_code }
  if (raw.shop_no != null) metadata.shopNo = raw.shop_no
  if (raw.status != null) metadata.status = raw.status

  const refund: Refund = { id: raw.refund_code, orderId: raw.order_id, metadata }
  const major = decimal(amount)
  if (major !== undefined && raw.currency) {
    refund.amount = { amount: majorToMinor(major, raw.currency), currency: raw.currency }
  }
  const createdAt = toIsoDatetime(raw.accepted_refund_date)
  if (createdAt) refund.createdAt = createdAt
  const processedAt = toIsoDatetime(raw.refund_date)
  if (processedAt) refund.processedAt = processedAt
  return refund
}

// ── Transforms ────────────────────────────────────────────────────────────────

/** A `GET /refunds` row. */
export function transformRefund(raw: RawCafe24RefundRow): Refund {
  const refund = core(raw, raw.actual_refund_amount)
  if (raw.order_item_code != null) refund.metadata.orderItemCodes = raw.order_item_code
  return refund
}

/** The `refund` of `GET /refunds/{refund_code}`. */
export function transformRefundDetail(raw: RawCafe24RefundDetail): Refund {
  const refund = core(raw, raw.refund_amount)
  if (raw.refund_reason) refund.reason = raw.refund_reason
  return refund
}

/** Canonical Refund → Cafe24 refund body (for create). */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (refund.reason != null) body.refund_type = refund.reason
  if (refund.note != null) body.note = refund.note
  if (refund.refundLineItems != null) {
    body.items = refund.refundLineItems.map((li) => ({
      order_item_code: li.lineItemId,
      quantity: li.quantity,
    }))
  }
  return body
}
