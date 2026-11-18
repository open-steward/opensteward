/**
 * SendOwl Order → canonical Order.
 *
 * Docs: https://dashboard.sendowl.com/developers/api/orders
 *
 * SendOwl has a single `state` field rather than separate financial /
 * fulfillment statuses, and digital delivery is automatic (no fulfillment
 * resource — see the adapter's `unavailableResources`). This module derives:
 *
 *  - `financialStatus` from `state` + `refunded` + the sum of
 *    `refund_transactions` against `settled_gross`.
 *  - `fulfillmentStatus` from `access_allowed` (download access granted).
 *
 * `cart.cart_items[].cart_item` (each wrapped in a singular key, SendOwl's
 * JSON convention for every nested array in this API — see `./refund.ts`)
 * is NOT mapped onto canonical `lineItems`: a cart item carries only
 * `quantity`, `product_id`/`package_id` and `price_at_checkout` — no
 * product/bundle name — and canonical `LineItem.title` is required, so
 * there is no honest, non-fabricated value to put there without an
 * additional per-item product/bundle lookup this transform layer doesn't
 * do. `Order.lineItems` is left undefined; the raw cart is still reachable
 * via `metadata.cart`.
 *
 * Money fields require a real `settled_currency` — SendOwl always reports
 * one on every order shape seen in the docs, but rather than default a
 * missing one to a guessed currency, a missing `settled_currency` simply
 * leaves every money-typed field on the order unset.
 */
import type { Order, OrderFinancialStatus, OrderFulfillmentStatus } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { extractRefunds, type RawSendOwlRefundTransactionEnvelope } from './refund'

export interface RawSendOwlCartItem {
  quantity?: number
  product_id?: number | string
  package_id?: number | string
  price_at_checkout?: number | string
  [key: string]: unknown
}

export interface RawSendOwlCart {
  cart_items?: Array<{ cart_item: RawSendOwlCartItem }>
  discount_code?: string
  discount_code_used?: boolean
  state?: string
  [key: string]: unknown
}

export interface RawSendOwlOrder {
  id: number | string
  state?: string
  buyer_name?: string
  buyer_email?: string
  customer_id?: number | string
  settled_currency?: string
  settled_gross?: string | number
  settled_tax?: string | number | null
  settled_shipping?: string | number | null
  discount?: string | number | null
  tag?: string | null
  refunded?: boolean
  refund_transactions?: RawSendOwlRefundTransactionEnvelope[]
  access_allowed?: boolean
  shipping_address1?: string | null
  shipping_address2?: string | null
  shipping_city?: string | null
  shipping_region?: string | null
  shipping_postcode?: string | null
  shipping_country?: string | null
  billing_address1?: string | null
  billing_address2?: string | null
  billing_city?: string | null
  billing_region?: string | null
  billing_postcode?: string | null
  billing_country?: string | null
  cart?: RawSendOwlCart
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function money(value: string | number | null | undefined, currency: string | undefined) {
  if (value == null || currency == null) return undefined
  return { amount: Math.round(Number(value) * 100), currency }
}

function address(
  raw: RawSendOwlOrder,
  prefix: 'shipping' | 'billing',
): Address | undefined {
  const line1 = raw[`${prefix}_address1`] as string | null | undefined
  const line2 = raw[`${prefix}_address2`] as string | null | undefined
  const city = raw[`${prefix}_city`] as string | null | undefined
  const region = raw[`${prefix}_region`] as string | null | undefined
  const postalCode = raw[`${prefix}_postcode`] as string | null | undefined
  const country = raw[`${prefix}_country`] as string | null | undefined
  if (!line1 && !city && !region && !postalCode && !country) return undefined
  return {
    line1: line1 ?? undefined,
    line2: line2 ?? undefined,
    city: city ?? undefined,
    region: region ?? undefined,
    postalCode: postalCode ?? undefined,
    country: country ?? undefined,
  }
}

function financialStatus(raw: RawSendOwlOrder): OrderFinancialStatus | undefined {
  if (raw.state === 'incomplete') return 'PENDING'
  if (raw.refunded) {
    const gross = Math.abs(Number(raw.settled_gross ?? 0))
    const refunded = (raw.refund_transactions ?? []).reduce(
      (sum, t) => sum + Math.abs(Number(t.refund_transaction.amount ?? 0)),
      0,
    )
    if (gross > 0 && refunded >= gross - 0.005) return 'REFUNDED'
    return 'PARTIALLY_REFUNDED'
  }
  if (raw.state === 'complete' || raw.state === 'free') return 'PAID'
  return 'unknown'
}

function fulfillmentStatus(raw: RawSendOwlOrder): OrderFulfillmentStatus | undefined {
  return raw.access_allowed ? 'FULFILLED' : 'UNFULFILLED'
}

export function transformOrder(raw: RawSendOwlOrder): Order {
  const currency = raw.settled_currency
  const refunds = extractRefunds(String(raw.id), raw.refund_transactions)
  return {
    id: String(raw.id),
    orderNumber: String(raw.id),
    name: `#${raw.id}`,
    customerId: raw.customer_id != null ? String(raw.customer_id) : undefined,
    email: raw.buyer_email,
    currency,
    totalTax: money(raw.settled_tax, currency),
    totalShipping: money(raw.settled_shipping, currency),
    totalDiscounts: money(raw.discount, currency),
    totalPrice: money(raw.settled_gross, currency),
    financialStatus: financialStatus(raw),
    fulfillmentStatus: fulfillmentStatus(raw),
    billingAddress: address(raw, 'billing'),
    shippingAddress: address(raw, 'shipping'),
    refundIds: refunds.length > 0 ? refunds.map((r) => r.id) : undefined,
    discountCodes: raw.cart?.discount_code ? [raw.cart.discount_code] : undefined,
    tags: raw.tag ? [raw.tag] : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: { ...raw },
  }
}

/**
 * Canonical Order → SendOwl order update body.
 *
 * SendOwl's `PUT /api/v1_3/orders/#{id}` only accepts buyer_name,
 * buyer_email, giftee_name, giftee_email, tag and shipping address fields —
 * there is no generic order-create (see the adapter's `unavailableResources`
 * note on order creation).
 */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (order.email != null) body['buyer_email'] = order.email
  if (order.tags != null) body['tag'] = order.tags[0]
  if (order.shippingAddress != null) {
    const a = order.shippingAddress
    if (a.line1 != null) body['shipping_address1'] = a.line1
    if (a.line2 != null) body['shipping_address2'] = a.line2
    if (a.city != null) body['shipping_city'] = a.city
    if (a.region != null) body['shipping_region'] = a.region
    if (a.postalCode != null) body['shipping_postcode'] = a.postalCode
    if (a.country != null) body['shipping_country'] = a.country
  }
  return body
}
