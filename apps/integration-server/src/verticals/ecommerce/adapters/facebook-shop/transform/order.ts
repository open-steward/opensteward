/**
 * Facebook Commerce Order → canonical Order.
 *
 * Source: the Order API reference
 * (https://developers.facebook.com/docs/commerce-platform/order-management/order-api):
 *   GET /{CMS_ID}/commerce_orders → list ("List all the commerce orders associated with a Shop.")
 *   GET /{ORDER_ID}               → get ("Fetch order details for a given Facebook Order ID.")
 *
 * Every field read here is one that page documents on the `order`, `item`,
 * `estimated_payment_details`, `subtotal_details`, `currency_amount` or
 * `shipping_address` objects. `currency_amount.amount` is "Amount in decimal
 * format, eg. \"5.5\"" and `currency` a "Three digit ISO-4217-3 code".
 *
 * Deliberately NOT mapped, because the page documents no source for them:
 *   - financialStatus: the order has no payment status; `order_status.state`
 *     is a fulfilment lifecycle (FB_PROCESSING, CREATED, IN_PROGRESS, COMPLETED).
 *   - totalDiscounts, cancelledAt: no discount amount or cancelled state is documented.
 */

import type { Order, LineItem, OrderFulfillmentStatus } from '../../../schema/order'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes (Order API reference) ─────────────────────────────────────────

/** `currency_amount` object. */
export interface RawFacebookMoney {
  amount: string
  currency: string
}

/** `item` object. */
export interface RawFacebookOrderItem {
  id: string
  retailer_id?: string
  /** Non-default: "must be explicitly asked for via a `fields=` query". */
  product_name?: string
  product_id?: string
  quantity: number
  price_per_unit?: RawFacebookMoney
  [key: string]: unknown
}

/** `shipping_address` object. */
export interface RawFacebookAddress {
  name?: string
  street1?: string
  street2?: string
  city?: string
  state?: string
  postal_code?: string
  country?: string
}

/** `order` object. */
export interface RawFacebookOrder {
  id: string
  order_status?: { state?: string }
  created?: string
  last_updated?: string
  /**
   * A paged edge: the Order API samples return `items: { data, paging }`.
   * The adapter replaces a truncated edge (one with `paging.next`) with the
   * full `/{ORDER_ID}/items` list before transforming, so this reads `data`.
   */
  items?: {
    data?: RawFacebookOrderItem[]
    paging?: { cursors?: { before?: string; after?: string }; next?: string }
  }
  ship_by_date?: string
  merchant_order_id?: string
  channel?: string
  shipping_address?: RawFacebookAddress
  estimated_payment_details?: {
    /** `subtotal_details`: "Sum of cost of items and shipping." */
    subtotal?: { items?: RawFacebookMoney; shipping?: RawFacebookMoney }
    tax?: RawFacebookMoney
    total_amount?: RawFacebookMoney
    tax_remitted?: boolean
  }
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(
  m: RawFacebookMoney | undefined,
): { amount: number; currency: string } | undefined {
  if (!m || !m.currency) return undefined
  const n = Number(m.amount)
  if (m.amount === '' || !Number.isFinite(n)) return undefined
  return { amount: majorToMinor(n, m.currency), currency: m.currency }
}

/**
 * `order_state` → canonical fulfilment status. The documented states:
 *   FB_PROCESSING — "Facebook is still processing this order."
 *   CREATED       — "Facebook has finalized the order, the seller needs to acknowledge the order"
 *   IN_PROGRESS   — "seller has to yet ship some or all items related to order"
 *   COMPLETED     — "All items present in the order are shipped and/or cancelled."
 * IN_PROGRESS covers both "some" and "all" items unshipped, so it cannot say
 * UNFULFILLED from PARTIAL; it maps to 'unknown'.
 * COMPLETED maps to FULFILLED although it also covers items that were
 * cancelled rather than shipped ("shipped and/or cancelled"): the order
 * carries no order-level field that tells the two apart, and a COMPLETED
 * order has nothing left to fulfil. Per-item `status` (non-default) holds
 * the breakdown and is not requested.
 */
export function mapFulfillmentStatus(
  state: string | undefined,
): OrderFulfillmentStatus | undefined {
  switch (state) {
    case undefined:
      return undefined
    case 'FB_PROCESSING':
    case 'CREATED':
      return 'UNFULFILLED'
    case 'COMPLETED':
      return 'FULFILLED'
    default:
      return 'unknown'
  }
}

function mapLineItem(orderId: string, raw: RawFacebookOrderItem): LineItem {
  const price = toMoney(raw.price_per_unit)
  if (!price) {
    throw new Error(
      `Facebook Shop order ${orderId} item ${raw.id} has no price_per_unit (a default item field)`,
    )
  }
  if (!raw.product_name) {
    throw new Error(
      `Facebook Shop order ${orderId} item ${raw.id} has no product_name; request it with items{product_name}`,
    )
  }
  return {
    id: raw.id,
    productId: raw.product_id,
    title: raw.product_name,
    quantity: raw.quantity,
    price,
    sku: raw.retailer_id,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function mapAddress(raw: RawFacebookAddress | undefined): Order['shippingAddress'] {
  if (!raw) return undefined
  return {
    line1: raw.street1,
    line2: raw.street2,
    city: raw.city,
    region: raw.state,
    postalCode: raw.postal_code,
    country: raw.country,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawFacebookOrder): Order {
  if (raw.items?.paging?.next) {
    // Mapping only the first nested page would return a short lineItems
    // array that still parses; the adapter must fetch the rest first.
    throw new Error(
      `Facebook Shop order ${raw.id} has more items than its nested page; read /${raw.id}/items first`,
    )
  }
  const payment = raw.estimated_payment_details
  const total = toMoney(payment?.total_amount)
  const lineItems = (raw.items?.data ?? []).map((li) => mapLineItem(raw.id, li))

  return {
    id: raw.id,
    orderNumber: raw.merchant_order_id,
    name: raw.merchant_order_id,
    currency: total?.currency,
    totalPrice: total,
    subtotalPrice: toMoney(payment?.subtotal?.items),
    totalShipping: toMoney(payment?.subtotal?.shipping),
    totalTax: toMoney(payment?.tax),
    fulfillmentStatus: mapFulfillmentStatus(raw.order_status?.state),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippingAddress: mapAddress(raw.shipping_address),
    createdAt: raw.created,
    updatedAt: raw.last_updated,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
