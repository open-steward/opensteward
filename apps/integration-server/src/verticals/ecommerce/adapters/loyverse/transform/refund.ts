/**
 * Loyverse Refund Receipt → canonical Refund.
 *
 * In Loyverse, refunds are represented as receipts with `receipt_type=REFUND`.
 * The `refund_for` field holds the original sale receipt_number. The
 * `line_items` carry the quantities and amounts being refunded.
 *
 * Because a refund receipt has the same shape as a sale receipt (both use
 * `RawLoyverseReceipt`), we reuse the receipt type here and simply map the
 * canonical Refund fields from the relevant subset.
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'
import type { RawLoyverseReceipt, RawLoyverseLineItem } from './order'

function toMinor(v: number | null | undefined, currency: string): number {
  if (v == null) return 0
  return majorToMinor(v, currency)
}

function mapRefundLineItem(
  raw: RawLoyverseLineItem,
  currency: string,
): RefundLineItem {
  return {
    lineItemId: raw.id ?? raw.variant_id ?? raw.item_id ?? 'unknown',
    quantity: Math.abs(raw.quantity ?? 0),
    amount:
      raw.total_money != null
        ? { amount: toMinor(Math.abs(raw.total_money), currency), currency }
        : undefined,
  }
}

export function transformRefund(raw: RawLoyverseReceipt, currency: string = 'USD'): Refund {
  const lineItems = (raw.line_items ?? []).map((li) => mapRefundLineItem(li, currency))

  return {
    id: raw.receipt_number,
    orderId: raw.refund_for ?? raw.receipt_number,
    amount:
      raw.total_money != null
        ? { amount: toMinor(Math.abs(raw.total_money), currency), currency }
        : undefined,
    note: raw.note ?? undefined,
    refundLineItems: lineItems.length > 0 ? lineItems : undefined,
    createdAt: raw.created_at ?? raw.receipt_date,
    processedAt: raw.created_at ?? raw.receipt_date,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → Loyverse refund receipt body. */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    receipt_type: 'REFUND',
    refund_for: refund.orderId,
    note: refund.note,
    line_items: refund.refundLineItems?.map((li) => ({
      variant_id: li.lineItemId,
      quantity: -(li.quantity ?? 0),
      price: li.amount?.amount != null ? -(li.amount.amount / 100) : undefined,
    })),
  }
}
