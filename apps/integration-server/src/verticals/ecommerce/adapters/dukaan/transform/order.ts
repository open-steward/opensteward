/**
 * Dukaan order → canonical Order.
 *
 * Two documented shapes, both keyed by the order `uuid` (the "Order uuid" of
 * the Important Keys table, and the path key of get order data):
 *
 *  - a row of get order list, GET /api/seller-front/order-list/
 *  - `data` of get order data, GET /api/order/seller/{order_uuid}/order/
 *
 * Only the detail carries a currency (`store_data.currency.cc`), so money is
 * mapped from the detail only. List rows carry `total_cost` with no currency;
 * it stays in `metadata`.
 *
 * `status` codes, from the collection's "Order Status Code Mapping" table:
 *   ABANDONED / DRAFT -1, PENDING 0, ACCEPTED 1, REJECTED 2, SHIPPED 3,
 *   CANCELLED 4, DELIVERED 5, FAILED 6, CANCELLED BY CUSTOMER 7, RETURNED 10.
 *
 * Docs: https://documenter.getpostman.com/view/25389466/2s9Yynk3f7
 */

import type { Order, LineItem, OrderFulfillmentStatus } from '../../../schema/order'
import type { Address, Money } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import { isIso3166Alpha2, toIsoDatetime } from '@opensteward/shared'

// ── Raw Dukaan shapes (fields as in the documented example responses) ────────

export interface RawDukaanBuyerAddress {
  pin: string | null
  city: string | null
  line: string | null
  buyer: { name: string | null; email: string | null; mobile: string | null } | null
  state: string | null
  country: string | null
  [key: string]: unknown
}

/** A row of get order list. */
export interface RawDukaanOrderListRow {
  id: number
  display_order_id: string
  created_at_utc: string
  modified_at_utc: string
  uuid: string
  status: number
  buyer_address: RawDukaanBuyerAddress | null
  total_cost: number
  [key: string]: unknown
}

/** One entry of `products` in get order data. */
export interface RawDukaanOrderProduct {
  quantity: number
  line_item_id: number
  line_item_discount: number
  selling_price: number
  name: string
  product_uuid: string
  sku: string | null
  [key: string]: unknown
}

/** `data` of get order data. */
export interface RawDukaanOrderDetail {
  display_order_id: string
  id: number
  uuid: string
  modified_at: string
  status: number
  created_at_utc: string
  total_cost: number
  coupon_discount: number
  delivery_cost: number
  notes: string | null
  store_lead_id: number | null
  address: RawDukaanBuyerAddress | null
  products: RawDukaanOrderProduct[]
  store_data: { currency: { cc: string } | null } | null
  coupon_code: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function text(v: string | null | undefined): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

/** From the Order Status Code Mapping table; codes with no fulfilment meaning are `unknown`. */
export function mapFulfillmentStatus(code: number): OrderFulfillmentStatus {
  switch (code) {
    case 0: // PENDING
    case 1: // ACCEPTED
      return 'UNFULFILLED'
    case 3: // SHIPPED
    case 5: // DELIVERED
      return 'FULFILLED'
    default:
      return 'unknown'
  }
}

function mapAddress(raw: RawDukaanBuyerAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const country = text(raw.country)?.toUpperCase()
  const out: Address = {
    line1: text(raw.line),
    city: text(raw.city),
    region: text(raw.state),
    postalCode: text(raw.pin),
    country: country && isIso3166Alpha2(country) ? country : undefined,
  }
  return Object.values(out).some((v) => v !== undefined) ? out : undefined
}

function money(amount: number | null | undefined, currency: string): Money | undefined {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return undefined
  return { amount: majorToMinor(amount, currency), currency }
}

function currencyOf(raw: RawDukaanOrderDetail): string | undefined {
  const cc = raw.store_data?.currency?.cc
  return typeof cc === 'string' && /^[A-Z]{3}$/.test(cc) ? cc : undefined
}

function mapLineItem(raw: RawDukaanOrderProduct, currency: string): LineItem | undefined {
  const price = money(raw.selling_price, currency)
  if (!price) return undefined
  return {
    id: String(raw.line_item_id),
    productId: text(raw.product_uuid),
    title: raw.name,
    quantity: raw.quantity,
    price,
    totalDiscount: money(raw.line_item_discount, currency),
    sku: text(raw.sku),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformOrderListRow(raw: RawDukaanOrderListRow): Order {
  return {
    id: raw.uuid,
    orderNumber: text(raw.display_order_id),
    email: text(raw.buyer_address?.buyer?.email),
    phone: text(raw.buyer_address?.buyer?.mobile),
    fulfillmentStatus: mapFulfillmentStatus(raw.status),
    shippingAddress: mapAddress(raw.buyer_address),
    createdAt: toIsoDatetime(raw.created_at_utc),
    updatedAt: toIsoDatetime(raw.modified_at_utc),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrderDetail(raw: RawDukaanOrderDetail): Order {
  const currency = currencyOf(raw)
  const lineItems = currency
    ? (raw.products ?? [])
        .map((p) => mapLineItem(p, currency))
        .filter((li): li is LineItem => li !== undefined)
    : undefined
  return {
    id: raw.uuid,
    orderNumber: text(raw.display_order_id),
    customerId: raw.store_lead_id != null ? String(raw.store_lead_id) : undefined,
    email: text(raw.address?.buyer?.email),
    phone: text(raw.address?.buyer?.mobile),
    currency,
    totalPrice: currency ? money(raw.total_cost, currency) : undefined,
    totalShipping: currency ? money(raw.delivery_cost, currency) : undefined,
    totalDiscounts: currency ? money(raw.coupon_discount, currency) : undefined,
    fulfillmentStatus: mapFulfillmentStatus(raw.status),
    lineItems: lineItems && lineItems.length > 0 ? lineItems : undefined,
    shippingAddress: mapAddress(raw.address),
    discountCodes: text(raw.coupon_code) ? [raw.coupon_code as string] : undefined,
    note: text(raw.notes),
    createdAt: toIsoDatetime(raw.created_at_utc),
    updatedAt: toIsoDatetime(raw.modified_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Write-side body for createOrder / updateOrder. Those methods are out of
 * scope for the list rebuild and still target undocumented paths.
 */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const currency = order.currency ?? 'INR'
  const body: Record<string, unknown> = {
    customer_email: order.email,
    customer_phone: order.phone,
    currency,
    note: order.note,
  }
  if (order.lineItems) {
    body['items'] = order.lineItems.map((li) => ({
      product_id: li.productId,
      variant_id: li.variantId,
      quantity: li.quantity,
      // Canonical price.amount is minor-unit integer; Dukaan expects major-unit decimal string.
      price:
        li.price?.amount != null
          ? String(minorToMajor(li.price.amount, li.price.currency ?? currency) ?? 0)
          : undefined,
      name: li.title,
      sku: li.sku,
    }))
  }
  if (order.shippingAddress) {
    const a = order.shippingAddress
    body['shipping_address'] = {
      address_line1: a.line1,
      address_line2: a.line2,
      city: a.city,
      state: a.region,
      pincode: a.postalCode,
      country: a.country,
    }
  }
  return body
}
