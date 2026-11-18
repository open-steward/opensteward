/**
 * FastSpring Return → canonical Refund.
 *
 * Docs:
 *  - https://developer.fastspring.com/reference/returns
 *  - https://developer.fastspring.com/reference/create-a-return
 *  - https://developer.fastspring.com/reference/retrieve-a-return
 *
 * FastSpring has no `restock` concept (digital goods) — always left
 * undefined rather than guessed.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

export interface RawFastSpringReturnItem {
  product: string
  /** Always shown in the documented retrieve-a-return example (a real, meaningful `0` for some partial refunds — never absent). */
  quantity: number
  subtotal?: number
}

export interface RawFastSpringReturn {
  return: string
  reference?: string
  changed?: number
  account?: string
  /** Always shown in the documented return examples — required so a missing value fails loudly instead of defaulting to a currency the return was never actually in. */
  currency: string
  totalReturn?: number
  reason?: string
  note?: string
  items?: RawFastSpringReturnItem[]
  /**
   * The parent order, keyed by `order` — matching the Order resource's own
   * id field name (see transform/order.ts). Every documented example shows
   * it; `original.id` is a redundant echo and is never read as a fallback.
   */
  original?: { order: string; id?: string }
  [key: string]: unknown
}

function mapRefundLineItems(
  raw: RawFastSpringReturnItem[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: li.product,
    quantity: Math.abs(li.quantity),
    amount: li.subtotal != null ? { amount: majorToMinor(Math.abs(li.subtotal), currency), currency } : undefined,
  }))
}

export function transformRefund(raw: RawFastSpringReturn): Refund {
  if (!raw.currency) {
    throw new Error(`FastSpring return "${raw.return}" is missing "currency" — cannot compute money fields.`)
  }
  if (!raw.original?.order) {
    throw new Error(`FastSpring return "${raw.return}" is missing "original.order" — cannot map orderId.`)
  }
  const currency = raw.currency
  const orderId = raw.original.order

  return {
    id: raw.return,
    orderId,
    amount:
      raw.totalReturn != null ? { amount: majorToMinor(raw.totalReturn, currency), currency } : undefined,
    reason: raw.reason,
    note: raw.note,
    refundLineItems: mapRefundLineItems(raw.items, currency),
    processedAt: toIsoDatetime(raw.changed),
    createdAt: toIsoDatetime(raw.changed),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Canonical Refund → FastSpring create-a-return body (`POST /returns`, one
 * entry of `returns[]`). `refund.orderId` is required — FastSpring returns
 * are always scoped to an order. Presence of `refundLineItems` selects a
 * PARTIAL return over a FULL one, per the documented request shape.
 */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    order: refund.orderId,
    reason: refund.reason,
    note: refund.note,
    notification: 'ORIGINAL',
  }
  if (refund.refundLineItems && refund.refundLineItems.length > 0) {
    body['refundType'] = 'PARTIAL'
    body['items'] = refund.refundLineItems.map((li) => {
      if (li.amount?.amount == null || !li.amount.currency) {
        throw new Error(
          `Partial refund line item "${li.lineItemId}" is missing amount/currency — FastSpring requires both to build the return.`,
        )
      }
      return { product: li.lineItemId, amount: minorToMajor(li.amount.amount, li.amount.currency) }
    })
  } else {
    body['refundType'] = 'FULL'
  }
  return body
}
