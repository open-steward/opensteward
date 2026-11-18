/**
 * Temu parent order → canonical Order.
 *
 * `bg.order.list.v2.get` returns `result.pageItems[]` and
 * `bg.order.detail.v2.get` returns `result`, both as
 * `{ parentOrderMap, orderList }` (fetched 2026-09-25 from
 * POST https://partner-us.temu.com/riemann/api/v2/api/doc/detail/get):
 *
 *   "parentOrderSn [STRING] :: Parent order number."
 *   "parentOrderStatus [INTEGER] :: Status of the parent order. 1-PENDING;
 *    2-UN_SHIPPING; 3-CANCELED; 4-SHIPPED; 41-PARTIALLY_SHIPPED; 5-DELIVERED;
 *    51-PARTIALLY_DELIVERED."
 *   "updateTime [LONG] :: Order update time, in seconds."
 *
 * One canonical Order per parent order: the parent order number is what both
 * the list and the detail endpoint key on (`parentOrderSn`).
 *
 * Not mapped: line items and every money field. `orderList` carries no price
 * or amount of any kind, and the canonical line item requires `price`. The
 * sub-orders stay in `metadata.orderList`. `parentOrderTime` ("Time when the
 * parent order was placed.") names no unit, so `createdAt` is left unset
 * rather than guessed.
 */

import type { Order, OrderFulfillmentStatus } from '../../../schema/order'

export interface RawTemuParentOrder {
  parentOrderSn?: string
  parentOrderStatus?: number
  updateTime?: number
  [key: string]: unknown
}

/** One `pageItems` entry, or the detail `result`. */
export interface RawTemuOrder {
  parentOrderMap?: RawTemuParentOrder
  orderList?: Array<Record<string, unknown>>
  [key: string]: unknown
}

/** `parentOrderStatus` → fulfillment progress. PENDING and CANCELED say nothing about shipping. */
function mapFulfillment(status: number | undefined): OrderFulfillmentStatus | undefined {
  switch (status) {
    case 2:
      return 'UNFULFILLED'
    case 4:
    case 5:
      return 'FULFILLED'
    case 41:
    case 51:
      return 'PARTIAL'
    default:
      return undefined
  }
}

export function transformOrder(raw: RawTemuOrder): Order {
  const parent = raw.parentOrderMap
  const sn = parent?.parentOrderSn
  if (typeof sn !== 'string' || sn === '')
    throw new Error('Temu order has no parentOrderMap.parentOrderSn')
  const order: Order = {
    id: sn,
    orderNumber: sn,
    metadata: raw as Record<string, unknown>,
  }
  const fulfillment = mapFulfillment(parent?.parentOrderStatus)
  if (fulfillment) order.fulfillmentStatus = fulfillment
  if (typeof parent?.updateTime === 'number')
    order.updatedAt = new Date(parent.updateTime * 1000).toISOString()
  return order
}
