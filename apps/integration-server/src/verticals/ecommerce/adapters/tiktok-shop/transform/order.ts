/**
 * TikTok Shop order → canonical Order.
 *
 * Get Order List 202309 (POST /order/202309/orders/search,
 * https://partner.tiktokshop.com/docv2/page/650aa8094a0bb702c06df242) and Get
 * Order Detail 202309 (GET /order/202309/orders?ids=,
 * https://partner.tiktokshop.com/docv2/page/650aa8ccc16ffe02b8f167a0) return
 * the same `orders[]` objects. Only fields both documents name are read:
 *
 *   status        string: UNPAID, ON_HOLD, AWAITING_SHIPMENT, PARTIALLY_SHIPPING,
 *                 AWAITING_COLLECTION, IN_TRANSIT, DELIVERED, COMPLETED, CANCELLED
 *   payment       { currency, sub_total, shipping_fee, tax, total_amount } (decimal strings)
 *   line_items[]  { id, sku_id, product_id, product_name, seller_sku, sale_price }
 *   recipient_address { address_line1, address_line2, postal_code, region_code }
 *   user_id, buyer_message, create_time, update_time, paid_time, cancel_time, cancel_reason,
 *   order_type
 *
 * A line item is ONE unit. The Order API overview
 * (https://partner.tiktokshop.com/docv2/page/650b1b4bbace3e02b76d1011):
 * "Order Line Item id: Each single item in a line is identified by its unique
 * order line item id", with 2 red shirts listed as "1x Red Large T Shirt
 * (item 1)" and "1x Red Large T Shirt (item 2)". So every line has quantity 1.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Money } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes (documented fields only) ─────────────────────────────────────

export interface RawTikTokOrderItem {
  id?: string
  sku_id?: string
  product_id?: string
  product_name?: string
  seller_sku?: string
  sale_price?: string
  [key: string]: unknown
}

export interface RawTikTokRecipientAddress {
  address_line1?: string
  address_line2?: string
  postal_code?: string
  region_code?: string
  [key: string]: unknown
}

export interface RawTikTokOrderPayment {
  currency?: string
  sub_total?: string
  shipping_fee?: string
  tax?: string
  total_amount?: string
  [key: string]: unknown
}

export interface RawTikTokOrder {
  id: string
  status?: string
  payment?: RawTikTokOrderPayment
  line_items?: RawTikTokOrderItem[]
  recipient_address?: RawTikTokRecipientAddress
  user_id?: string
  buyer_message?: string
  create_time?: number
  update_time?: number
  paid_time?: number
  cancel_time?: number
  rts_time?: number
  cancel_reason?: string
  /** NORMAL, ZERO_LOTTERY, AUCTION, PRE_ORDER, MADE_TO_ORDER, BACK_ORDER, VIRTUAL_ORDER. */
  order_type?: string
  [key: string]: unknown
}

// ── Status maps ─────────────────────────────────────────────────────────────

/**
 * UNPAID has not been paid. The overview's status transitions: "From UNPAID
 * to ON_HOLD — Trigger: When the order is paid", so every later status was
 * paid. A CANCELLED order may or may not have been paid or refunded; the
 * status does not say, so it is 'unknown'.
 *
 * Except a pre-order on hold. Get Order List: "`ON_HOLD`: … If
 * `order_type=PRE_ORDER`, the product is still awaiting release so payment
 * will only be authorized 1 day before the release". Its payment is not yet
 * even authorized, so it is PENDING.
 */
export function mapFinancialStatus(
  status: string | undefined,
  orderType?: string,
): OrderFinancialStatus | undefined {
  switch (status) {
    case undefined:
      return undefined
    case 'UNPAID':
      return 'PENDING'
    case 'ON_HOLD':
      return orderType === 'PRE_ORDER' ? 'PENDING' : 'PAID'
    case 'AWAITING_SHIPMENT':
    case 'PARTIALLY_SHIPPING':
    case 'AWAITING_COLLECTION':
    case 'IN_TRANSIT':
    case 'DELIVERED':
    case 'COMPLETED':
      return 'PAID'
    default:
      return 'unknown'
  }
}

/**
 * AWAITING_SHIPMENT: "no items have been shipped yet"; PARTIALLY_SHIPPING:
 * "Some items in the order have been shipped, but not all"; AWAITING_COLLECTION:
 * "the package is waiting to be collected by the carrier"; IN_TRANSIT onward:
 * collected by the carrier. A CANCELLED order's shipping state is not given.
 */
export function mapFulfillmentStatus(
  status: string | undefined,
): OrderFulfillmentStatus | undefined {
  switch (status) {
    case undefined:
      return undefined
    case 'UNPAID':
    case 'ON_HOLD':
    case 'AWAITING_SHIPMENT':
    case 'AWAITING_COLLECTION':
      return 'UNFULFILLED'
    case 'PARTIALLY_SHIPPING':
      return 'PARTIAL'
    case 'IN_TRANSIT':
    case 'DELIVERED':
    case 'COMPLETED':
      return 'FULFILLED'
    default:
      return 'unknown'
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** A documented decimal string in the order's currency, or undefined when either is absent. */
function money(value: string | undefined, currency: string | undefined): Money | undefined {
  if (value === undefined || value === '' || !currency) return undefined
  const amount = majorToMinor(Number(value), currency)
  return amount === undefined ? undefined : { amount, currency }
}

const iso = (secs: number | undefined): string | undefined =>
  typeof secs === 'number' ? new Date(secs * 1000).toISOString() : undefined

function mapLineItem(orderId: string, raw: RawTikTokOrderItem, currency: string): LineItem {
  if (!raw.id) throw new Error(`TikTok Shop order '${orderId}': a line item has no id`)
  if (!raw.product_name) {
    throw new Error(`TikTok Shop order '${orderId}': line item '${raw.id}' has no product_name`)
  }
  const price = money(raw.sale_price, currency)
  if (!price) {
    throw new Error(`TikTok Shop order '${orderId}': line item '${raw.id}' has no sale_price`)
  }
  return {
    id: raw.id,
    productId: raw.product_id,
    variantId: raw.sku_id,
    title: raw.product_name,
    quantity: 1,
    price,
    sku: raw.seller_sku,
    metadata: raw as Record<string, unknown>,
  }
}

function mapShippingAddress(addr: RawTikTokRecipientAddress | undefined) {
  if (!addr) return undefined
  return {
    line1: addr.address_line1 || undefined,
    line2: addr.address_line2 || undefined,
    postalCode: addr.postal_code || undefined,
    country: addr.region_code || undefined,
  }
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformOrder(raw: RawTikTokOrder): Order {
  const currency = raw.payment?.currency || undefined
  // A line's price needs the order's currency ("Please refer to the currency
  // of `payment_info`"); without one no line can be priced, so none is built.
  const lineItems =
    raw.line_items && currency
      ? raw.line_items.map((li) => mapLineItem(raw.id, li, currency))
      : undefined
  const isCancelled = raw.status === 'CANCELLED'

  return {
    id: raw.id,
    orderNumber: raw.id,
    name: raw.id,
    customerId: raw.user_id || undefined,
    currency,
    subtotalPrice: money(raw.payment?.sub_total, currency),
    totalTax: money(raw.payment?.tax, currency),
    totalShipping: money(raw.payment?.shipping_fee, currency),
    totalPrice: money(raw.payment?.total_amount, currency),
    financialStatus: mapFinancialStatus(raw.status, raw.order_type),
    fulfillmentStatus: mapFulfillmentStatus(raw.status),
    lineItems,
    shippingAddress: mapShippingAddress(raw.recipient_address),
    note: raw.buyer_message || undefined,
    createdAt: iso(raw.create_time),
    updatedAt: iso(raw.update_time),
    processedAt: iso(raw.paid_time),
    cancelledAt: isCancelled ? iso(raw.cancel_time) : undefined,
    cancelReason: isCancelled ? raw.cancel_reason || undefined : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
