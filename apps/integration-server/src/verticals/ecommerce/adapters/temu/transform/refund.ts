/**
 * Temu parent after-sales order → canonical Refund.
 *
 * One row of `result.data` from `bg.aftersales.parentaftersales.list.get`
 * (fetched 2026-09-25 from
 * POST https://partner-us.temu.com/riemann/api/v2/api/doc/detail/get):
 *
 *   "parentAfterSalesSn [STRING] :: Parent after-sales-order number."
 *   "parentOrderSn [STRING] :: Parent order number."
 *
 * The adapter asks only for `afterSalesStatusGroup` 5 ("5: Refunded"), so
 * every row is a refund that was issued.
 *
 * Not mapped: `amount` (the list row carries no money field) and `createdAt`.
 * The docs describe the row's `createAt` as "Last update time of the parent
 * after-sales order, in seconds", the same words as `updateAt`, so which
 * instant it holds is not documented. The row stays in `metadata`.
 */

import type { Refund } from '../../../schema/refund'

export interface RawTemuRefund {
  parentAfterSalesSn?: string
  parentOrderSn?: string
  [key: string]: unknown
}

export function transformRefund(raw: RawTemuRefund): Refund {
  const id = raw.parentAfterSalesSn
  if (typeof id !== 'string' || id === '')
    throw new Error('Temu after-sales row has no parentAfterSalesSn')
  const orderId = raw.parentOrderSn
  if (typeof orderId !== 'string' || orderId === '')
    throw new Error(`Temu after-sales ${id} has no parentOrderSn`)
  return { id, orderId, metadata: raw as Record<string, unknown> }
}
