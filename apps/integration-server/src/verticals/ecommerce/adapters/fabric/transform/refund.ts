/**
 * fabric Refund → canonical Refund.
 *
 * fabric refunds endpoint: `GET /v3/orders/{orderId}/refunds`.
 * Each refund has `amount`, `reason`, `note`, `restock`, `line_items`,
 * and associated `transaction_ids`.
 *
 * Money values are decimal (not cents).
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

const ZERO_DECIMAL = new Set([
  'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'XOF', 'XAF', 'PYG', 'UGX', 'RWF',
])
const THREE_DECIMAL = new Set(['BHD', 'KWD', 'OMR', 'TND', 'JOD', 'IQD', 'LYD'])

/** Integer minor units → major-unit decimal for upstream payloads. */
function minorToMajor(money: { amount: number; currency: string } | undefined):
  | number
  | undefined {
  if (money == null) return undefined
  const c = money.currency.toUpperCase()
  const exponent = ZERO_DECIMAL.has(c) ? 0 : THREE_DECIMAL.has(c) ? 3 : 2
  return money.amount / 10 ** exponent
}

export interface RawFabricRefundLineItem {
  line_item_id: string
  quantity: number
  amount?: number
  currency?: string
  [key: string]: unknown
}

export interface RawFabricRefund {
  id: string
  order_id?: string
  amount?: number
  currency?: string
  reason?: string
  note?: string
  restock?: boolean
  line_items?: RawFabricRefundLineItem[]
  transaction_ids?: string[]
  processed_at?: string
  created_at?: string
  [key: string]: unknown
}

function mapRefundLineItem(raw: RawFabricRefundLineItem, currency: string): RefundLineItem {
  return {
    lineItemId: raw.line_item_id,
    quantity: raw.quantity,
    amount:
      raw.amount != null
        ? { amount: majorToMinor(raw.amount, raw.currency ?? currency), currency: raw.currency ?? currency }
        : undefined,
  }
}

export function transformRefund(raw: RawFabricRefund): Refund {
  const currency = raw.currency ?? 'USD'
  return {
    id: raw.id,
    orderId: raw.order_id ?? '',
    amount:
      raw.amount != null
        ? { amount: majorToMinor(raw.amount, currency), currency }
        : undefined,
    reason: raw.reason,
    note: raw.note,
    restock: raw.restock,
    refundLineItems: raw.line_items?.map((li) => mapRefundLineItem(li, currency)),
    transactionIds: raw.transaction_ids,
    processedAt: raw.processed_at,
    createdAt: raw.created_at,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    amount: minorToMajor(refund.amount),
    currency: refund.amount?.currency ?? 'USD',
    reason: refund.reason,
    note: refund.note,
    restock: refund.restock,
    line_items: refund.refundLineItems?.map((li) => ({
      line_item_id: li.lineItemId,
      quantity: li.quantity,
      amount: minorToMajor(li.amount),
    })),
  }
}
