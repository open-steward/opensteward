/**
 * StoreHippo `ms.orders` record → canonical Order.
 *
 * Fields, from the ms-orders reference
 * (https://help.storehippo.com/api/reference/ms-orders):
 *   order_id         "The unique id of order." (ex OID100)
 *   items[]          "_id" "The unique numeric identifier for the product in the cart.",
 *                    "name", "product_id" "Unique id of the product.",
 *                    "variant_id" "Variant id of the selected product.",
 *                    "price" "Price of the product.", "quantity"
 *   status           "Open ... Closed ... Cancelled"
 *   financial_status "Possible values are : Pending = ... Paid = ..."
 *   discounts        "cart level discounts" ({ "_id", "saving_amount", "coupon_code" })
 *   total, sub_total, taxes_total, shipping_total, discounts_total
 *   currency         "It is object containing name and conversion_rate of currency"
 *                    (ex { "name":"USD", "conversion_rate":"0.14" })
 *   billing_address / shipping_address  { full_name, address, city, state, zip, country, phone }
 *   email, user_id   "the unique id of user placed the order"
 *   cancellation_reason, cancelled_on
 * `_id`, `created_on` and `updated_on` are on every record in the documented
 * responses (the "Retrieve a Single Order" example).
 *
 * Money uses the order's own `currency.name`. An order without one gets no
 * money fields and no line items (a line item's price is required money).
 */

import type { LineItem, Order, OrderFinancialStatus } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { minorToMajor } from '../../../schema/shared'
import { count, countryCode, currencyCode, email, money, recordId, text } from '../values'
import { variantKey } from './product'

export interface RawStoreHippoAddress {
  full_name?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  phone?: string
  [key: string]: unknown
}

export interface RawStoreHippoOrderItem {
  _id?: string
  name?: string
  product_id?: string
  variant_id?: string | null
  price?: string | number
  quantity?: number | string
  [key: string]: unknown
}

export interface RawStoreHippoOrder {
  _id?: string
  order_id?: string
  items?: RawStoreHippoOrderItem[]
  status?: string
  financial_status?: string
  discounts?: Array<{ coupon_code?: string; [key: string]: unknown }>
  total?: number | string
  sub_total?: number | string
  taxes_total?: number | string
  shipping_total?: number | string
  discounts_total?: number | string
  currency?: { name?: string; conversion_rate?: string | number; [key: string]: unknown }
  billing_address?: RawStoreHippoAddress
  shipping_address?: RawStoreHippoAddress
  email?: string
  user_id?: string | null
  cancellation_reason?: string
  cancelled_on?: string
  created_on?: string
  updated_on?: string
  [key: string]: unknown
}

function mapFinancialStatus(v: unknown): OrderFinancialStatus | undefined {
  if (typeof v !== 'string' || v === '') return undefined
  switch (v.toLowerCase()) {
    case 'pending':
      return 'PENDING'
    case 'paid':
      return 'PAID'
    default:
      return 'unknown'
  }
}

function mapAddress(raw: RawStoreHippoAddress | undefined): Address | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Address = {
    ...(text(raw.address) ? { line1: raw.address } : {}),
    ...(text(raw.city) ? { city: raw.city } : {}),
    ...(text(raw.state) ? { region: raw.state } : {}),
    ...(text(raw.zip) ? { postalCode: raw.zip } : {}),
    ...(countryCode(raw.country) ? { country: raw.country } : {}),
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function mapLineItem(raw: RawStoreHippoOrderItem, orderId: string, currency: string): LineItem {
  const id = text(raw._id)
  if (!id) throw new Error(`StoreHippo order ${orderId} has an item without _id`)
  const title = text(raw.name)
  if (!title) throw new Error(`StoreHippo order ${orderId} item ${id} has no name`)
  const quantity = count(raw.quantity)
  if (quantity === undefined)
    throw new Error(`StoreHippo order ${orderId} item ${id} has no quantity`)
  const price = money(raw.price, currency)
  if (!price) throw new Error(`StoreHippo order ${orderId} item ${id} has no numeric price`)
  const productId = text(raw.product_id)
  const variantId = text(raw.variant_id)
  return {
    id,
    ...(productId ? { productId } : {}),
    ...(productId && variantId ? { variantId: variantKey(productId, variantId) } : {}),
    title,
    quantity,
    price,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawStoreHippoOrder): Order {
  const id = recordId(raw, 'order')
  const currency = currencyCode(raw.currency?.name)
  const financialStatus = mapFinancialStatus(raw.financial_status)
  const billingAddress = mapAddress(raw.billing_address)
  const shippingAddress = mapAddress(raw.shipping_address)
  const orderEmail = email(raw.email)
  const customerId = text(raw.user_id)
  const discountCodes = Array.isArray(raw.discounts)
    ? raw.discounts
        .map((d) => d?.coupon_code)
        .filter((c): c is string => typeof c === 'string' && c !== '')
    : []
  const totals = {
    subtotalPrice: money(raw.sub_total, currency),
    totalTax: money(raw.taxes_total, currency),
    totalDiscounts: money(raw.discounts_total, currency),
    totalShipping: money(raw.shipping_total, currency),
    totalPrice: money(raw.total, currency),
  }
  const lineItems =
    currency && Array.isArray(raw.items)
      ? raw.items.map((item) => mapLineItem(item, id, currency))
      : undefined
  return {
    id,
    ...(text(raw.order_id) ? { orderNumber: raw.order_id } : {}),
    ...(customerId ? { customerId } : {}),
    ...(orderEmail ? { email: orderEmail } : {}),
    ...(currency ? { currency } : {}),
    ...Object.fromEntries(Object.entries(totals).filter(([, v]) => v !== undefined)),
    ...(financialStatus ? { financialStatus } : {}),
    ...(lineItems ? { lineItems } : {}),
    ...(billingAddress ? { billingAddress } : {}),
    ...(shippingAddress ? { shippingAddress } : {}),
    ...(discountCodes.length > 0 ? { discountCodes } : {}),
    ...(text(raw.created_on) ? { createdAt: raw.created_on } : {}),
    ...(text(raw.updated_on) ? { updatedAt: raw.updated_on } : {}),
    ...(text(raw.cancelled_on) ? { cancelledAt: raw.cancelled_on } : {}),
    ...(text(raw.cancellation_reason) ? { cancelReason: raw.cancellation_reason } : {}),
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Order → StoreHippo order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    email: order.email,
    phone: order.phone,
    currency: order.currency,
    notes: order.note,
    discountCode: order.discountCodes?.[0],
    items: order.lineItems?.map((li) => ({
      variantId: li.variantId,
      productId: li.productId,
      qty: li.quantity,
      price:
        li.price?.amount != null ? minorToMajor(li.price.amount, li.price.currency) : undefined,
      name: li.title,
      sku: li.sku,
    })),
  }
}
