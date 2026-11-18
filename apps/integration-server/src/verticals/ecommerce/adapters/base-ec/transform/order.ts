/**
 * BASE order ↔ canonical Order.
 *
 * Confirmed fields (https://docs.thebase.in/api/orders,
 * .../api/orders/detail): `unique_key` (order id), `ordered`/`dispatched`/
 * `cancelled`/`modified` (unix seconds), `dispatch_status` (`unshippable`,
 * `ordered`, `cancelled`, `dispatched`, `unpaid`, `shipping`), `payment`
 * (payment method), buyer name/address fields, `total`, `shipping_fee`,
 * `cod_fee`, and an `order_items[]` array — each carrying its OWN `status`
 * (`ordered`/`cancelled`/`dispatched`). BASE tracks shipment/cancellation
 * status per LINE ITEM, not per order — see `edit_status`'s
 * `order_item_id`-keyed params (https://docs.thebase.in/api/orders/edit_status)
 * and `BaseEcAdapter.cancelOrder`, which fans out over every still-`ordered`
 * line item.
 *
 * Status mapping is necessarily approximate: BASE conflates payment and
 * shipment state in one `dispatch_status` enum. `unpaid` (deferred/COD
 * payment awaiting confirmation) maps to financial PENDING; `cancelled`
 * maps to financial VOIDED; everything else is treated as PAID, since BASE
 * settles payment at checkout for its other payment methods before an order
 * reaches the merchant API at all.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { LineItem, Order } from '../../../schema/order'
import { CURRENCY } from '../constants'

export interface RawBaseEcOrderItem {
  order_item_id: number | string
  item_id?: number | string
  variation_id?: number | string
  title?: string
  price?: number
  amount?: number
  total?: number
  status?: 'ordered' | 'cancelled' | 'dispatched' | string
  [key: string]: unknown
}

export interface RawBaseEcOrder {
  unique_key: string
  ordered?: number | string
  dispatched?: number | string
  cancelled?: number | string
  modified?: number | string
  dispatch_status?: string
  payment?: string
  first_name?: string
  last_name?: string
  mail_address?: string
  zip_code?: string
  prefecture?: string
  address?: string
  address2?: string
  country_code?: string
  total?: number
  shipping_fee?: number
  order_items?: RawBaseEcOrderItem[]
  [key: string]: unknown
}

/**
 * `title`, `amount` (quantity) and `price` are required on the canonical
 * `LineItem` — BASE's own docs show them present on every `order_items[]`
 * entry, so a missing one is a signal the platform response is
 * unexpectedly shaped, not something to paper over with `''`/`0`.
 */
function transformLineItem(oi: RawBaseEcOrderItem, orderId: string): LineItem {
  if (!oi.title) {
    throw new Error(
      `BASE order '${orderId}' line item '${oi.order_item_id}' has no title`,
    )
  }
  if (oi.amount == null) {
    throw new Error(
      `BASE order '${orderId}' line item '${oi.order_item_id}' has no amount (quantity)`,
    )
  }
  if (oi.price == null) {
    throw new Error(
      `BASE order '${orderId}' line item '${oi.order_item_id}' has no price`,
    )
  }
  return {
    id: String(oi.order_item_id),
    productId: oi.item_id != null ? String(oi.item_id) : undefined,
    variantId:
      oi.item_id != null && oi.variation_id != null
        ? `${oi.item_id}:${oi.variation_id}`
        : oi.item_id != null
          ? `${oi.item_id}:default`
          : undefined,
    title: oi.title,
    quantity: oi.amount,
    price: { amount: oi.price, currency: CURRENCY },
    fulfillmentStatus: oi.status === 'dispatched' ? 'FULFILLED' : 'UNFULFILLED',
    metadata: oi as unknown as Record<string, unknown>,
  }
}

export function transformOrder(order: RawBaseEcOrder): Order {
  const lineItems = (order.order_items ?? []).map((oi) => transformLineItem(oi, order.unique_key))
  const hasAddress = Boolean(order.address || order.zip_code)

  return {
    id: order.unique_key,
    orderNumber: order.unique_key,
    email: order.mail_address,
    currency: CURRENCY,
    totalPrice: order.total != null ? { amount: order.total, currency: CURRENCY } : undefined,
    totalShipping:
      order.shipping_fee != null ? { amount: order.shipping_fee, currency: CURRENCY } : undefined,
    financialStatus:
      order.dispatch_status === 'unpaid'
        ? 'PENDING'
        : order.dispatch_status === 'cancelled'
          ? 'VOIDED'
          : 'PAID',
    fulfillmentStatus: order.dispatch_status === 'dispatched' ? 'FULFILLED' : 'UNFULFILLED',
    lineItems,
    shippingAddress: hasAddress
      ? {
          line1: order.address,
          line2: order.address2,
          postalCode: order.zip_code,
          region: order.prefecture,
          country: order.country_code,
        }
      : undefined,
    createdAt: toIsoDatetime(order.ordered),
    updatedAt: toIsoDatetime(order.modified),
    cancelledAt: toIsoDatetime(order.cancelled),
    metadata: order as unknown as Record<string, unknown>,
  }
}
