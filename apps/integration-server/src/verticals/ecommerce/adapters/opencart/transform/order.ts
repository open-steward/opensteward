/**
 * OpenCart Order → canonical Order.
 *
 * OpenCart uses `order_status_id` to track order state. Common statuses:
 *
 *   0  → Missing / Incomplete
 *   1  → Pending
 *   2  → Processing
 *   3  → Shipped
 *   5  → Complete
 *   7  → Cancelled
 *   8  → Denied
 *   9  → Cancelled Reversal
 *   10 → Failed
 *   11 → Refunded
 *   15 → Processed
 *
 * Line items are under `products` array. Totals are in an `order_total`
 * or `totals` array with code-based entries (sub_total, shipping, tax, total).
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw OpenCart shapes ─────────────────────────────────────────────────────

export interface RawOpenCartOrderProduct {
  order_product_id: number | string
  product_id?: number | string
  name: string
  model?: string
  quantity: number | string
  price?: string | number
  total?: string | number
  tax?: string | number
  [key: string]: unknown
}

export interface RawOpenCartOrderTotal {
  code: string
  title?: string
  value?: string | number
  sort_order?: number | string
}

export interface RawOpenCartOrder {
  order_id: number | string
  invoice_no?: string | number
  invoice_prefix?: string
  order_status_id?: number | string
  order_status?: string
  store_name?: string
  customer_id?: number | string
  firstname?: string | null
  lastname?: string | null
  email?: string | null
  telephone?: string | null
  currency_code?: string
  currency_value?: string | number
  comment?: string | null
  total?: string | number
  // Billing / payment address
  payment_firstname?: string | null
  payment_lastname?: string | null
  payment_company?: string | null
  payment_address_1?: string | null
  payment_address_2?: string | null
  payment_city?: string | null
  payment_zone?: string | null
  payment_postcode?: string | null
  payment_country?: string | null
  payment_method?: string
  // Shipping address
  shipping_firstname?: string | null
  shipping_lastname?: string | null
  shipping_company?: string | null
  shipping_address_1?: string | null
  shipping_address_2?: string | null
  shipping_city?: string | null
  shipping_zone?: string | null
  shipping_postcode?: string | null
  shipping_country?: string | null
  shipping_method?: string
  products?: RawOpenCartOrderProduct[]
  totals?: RawOpenCartOrderTotal[]
  date_added?: string
  date_modified?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapPaymentAddress(raw: RawOpenCartOrder): Address | undefined {
  const line1 = raw.payment_address_1 ?? undefined
  const city = raw.payment_city ?? undefined
  const country = raw.payment_country ?? undefined
  if (!line1 && !city && !country) return undefined
  return {
    line1,
    line2: raw.payment_address_2 ?? undefined,
    city,
    region: raw.payment_zone ?? undefined,
    postalCode: raw.payment_postcode ?? undefined,
    country,
  }
}

function mapShippingAddress(raw: RawOpenCartOrder): Address | undefined {
  const line1 = raw.shipping_address_1 ?? undefined
  const city = raw.shipping_city ?? undefined
  const country = raw.shipping_country ?? undefined
  if (!line1 && !city && !country) return undefined
  return {
    line1,
    line2: raw.shipping_address_2 ?? undefined,
    city,
    region: raw.shipping_zone ?? undefined,
    postalCode: raw.shipping_postcode ?? undefined,
    country,
  }
}

/**
 * Map OpenCart order_status_id to canonical financial + fulfillment pair.
 */
function mapStatuses(statusId: number | string | undefined): {
  financialStatus?: OrderFinancialStatus
  fulfillmentStatus?: OrderFulfillmentStatus
} {
  if (statusId == null) return {}
  const id = typeof statusId === 'string' ? parseInt(statusId, 10) : statusId
  switch (id) {
    case 0: // Missing/Incomplete
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 1: // Pending
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 2: // Processing
    case 15: // Processed
      return { financialStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED' }
    case 3: // Shipped
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 5: // Complete
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 7: // Cancelled
    case 8: // Denied
    case 10: // Failed
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    case 11: // Refunded
      return { financialStatus: 'REFUNDED', fulfillmentStatus: 'UNFULFILLED' }
    default:
      return {}
  }
}

function mapLineItem(raw: RawOpenCartOrderProduct, currency: string): LineItem {
  const total = toNum(raw.total)
  const qty = toNum(raw.quantity) > 0 ? toNum(raw.quantity) : 1
  const unitPrice = raw.price != null ? toNum(raw.price) : total / qty

  return {
    id: String(raw.order_product_id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    title: raw.name,
    quantity: toNum(raw.quantity),
    price: { amount: majorToMinor(unitPrice, currency), currency },
    sku: raw.model ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Extract a specific total by code from the OpenCart totals array.
 */
function findTotal(totals: RawOpenCartOrderTotal[] | undefined, code: string): number | undefined {
  if (!totals) return undefined
  const entry = totals.find((t) => t.code === code)
  return entry?.value != null ? toNum(entry.value) : undefined
}

export function transformOrder(raw: RawOpenCartOrder): Order {
  const currency = raw.currency_code ?? 'USD'
  const money = (v: number | undefined) =>
    v != null ? { amount: majorToMinor(v, currency), currency } : undefined
  const { financialStatus, fulfillmentStatus } = mapStatuses(raw.order_status_id)

  const subtotal = findTotal(raw.totals, 'sub_total')
  const tax = findTotal(raw.totals, 'tax')
  const shipping = findTotal(raw.totals, 'shipping')

  return {
    id: String(raw.order_id),
    orderNumber: raw.invoice_no != null ? String(raw.invoice_no) : undefined,
    name: raw.invoice_no != null
      ? `${raw.invoice_prefix ?? ''}${raw.invoice_no}`
      : undefined,
    customerId:
      raw.customer_id != null && raw.customer_id !== 0
        ? String(raw.customer_id)
        : undefined,
    email: raw.email ?? undefined,
    phone: raw.telephone ?? undefined,
    currency,
    subtotalPrice: money(subtotal),
    totalTax: money(tax),
    totalShipping: money(shipping),
    totalPrice: raw.total != null ? { amount: majorToMinor(toNum(raw.total), currency), currency } : undefined,
    financialStatus,
    fulfillmentStatus,
    lineItems: (raw.products ?? []).map((p) => mapLineItem(p, currency)),
    billingAddress: mapPaymentAddress(raw),
    shippingAddress: mapShippingAddress(raw),
    note: raw.comment ?? undefined,
    createdAt: toIsoDatetime(raw.date_added),
    updatedAt: toIsoDatetime(raw.date_modified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → OpenCart order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    currency_code: order.currency,
    comment: order.note,
    customer_id: order.customerId,
    email: order.email,
    telephone: order.phone,
  }
  if (order.billingAddress) {
    body['payment_address_1'] = order.billingAddress.line1
    body['payment_address_2'] = order.billingAddress.line2
    body['payment_city'] = order.billingAddress.city
    body['payment_zone'] = order.billingAddress.region
    body['payment_postcode'] = order.billingAddress.postalCode
    body['payment_country'] = order.billingAddress.country
  }
  if (order.shippingAddress) {
    body['shipping_address_1'] = order.shippingAddress.line1
    body['shipping_address_2'] = order.shippingAddress.line2
    body['shipping_city'] = order.shippingAddress.city
    body['shipping_zone'] = order.shippingAddress.region
    body['shipping_postcode'] = order.shippingAddress.postalCode
    body['shipping_country'] = order.shippingAddress.country
  }
  if (order.lineItems) {
    body['products'] = order.lineItems.map((li) => ({
      product_id: li.productId,
      quantity: li.quantity,
      name: li.title,
      model: li.sku,
      price: li.price?.amount,
      total: li.price?.amount != null ? li.price.amount * li.quantity : undefined,
    }))
  }
  return body
}
