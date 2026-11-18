/**
 * Yo!Kart Order → canonical Order.
 *
 * Yo!Kart orders have a single `order_status` field that covers both the
 * payment and fulfillment state. We split it into the canonical pair:
 *
 *   incomplete     → {PENDING,           UNFULFILLED}
 *   pending        → {PENDING,           UNFULFILLED}
 *   confirmed      → {PAID,              UNFULFILLED}
 *   awaiting_payment → {PENDING,         UNFULFILLED}
 *   payment_failed → {VOIDED,            UNFULFILLED}
 *   completed      → {PAID,              FULFILLED}
 *   cancelled      → {VOIDED,            UNFULFILLED}
 *   refunded       → {REFUNDED,          UNFULFILLED}
 *   partially_refunded → {PARTIALLY_REFUNDED, UNFULFILLED}
 *   shipped        → {PAID,              PARTIAL}
 *   delivered      → {PAID,              FULFILLED}
 *
 * Money fields come as currency-prefixed strings (e.g. "€49.50") or numeric
 * strings without symbols. We parse them with the same helper used for
 * products and convert to minor units via `majorToMinor`.
 *
 * Yo!Kart order API paths:
 *   GET /admin/orders/listing       → paginated list (data.orders[])
 *   GET /admin/orders/view/{id}     → single order detail
 *   POST /admin/orders/cancel/{id}  → cancel an order
 */

import { toIsoDatetime } from '@opensteward/shared'
import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Yo!Kart shapes ────────────────────────────────────────────────────────

export interface RawYokartOrderAddress {
  oua_name?: string | null
  oua_address1?: string | null
  oua_address2?: string | null
  oua_city?: string | null
  oua_state?: string | null
  oua_zip?: string | null
  oua_country?: string | null
  oua_phone?: string | null
  [key: string]: unknown
}

export interface RawYokartOrderProduct {
  op_id: number | string
  product_id?: number | string
  selprod_id?: number | string
  product_name?: string
  product_model?: string
  op_qty?: number | string
  op_unit_price?: string | number
  op_total?: string | number
  op_discount?: string | number
  [key: string]: unknown
}

export interface RawYokartOrder {
  order_id: number | string
  order_number?: string | null
  user_id?: number | string
  buyer_email?: string | null
  buyer_name?: string | null
  buyer_phone?: string | null
  /** Combined order status (payment + fulfillment). */
  order_status?: string
  /** Payment method code. */
  order_payment_method?: string
  order_currency?: string
  /** Total order amount as string (with or without currency symbol). */
  order_total_amount?: string | number | null
  order_subtotal?: string | number | null
  order_tax?: string | number | null
  order_discount?: string | number | null
  order_shipping?: string | number | null
  /** Applied promo/coupon code. */
  order_coupon_code?: string | null
  /** Array of order products / line items. */
  products?: RawYokartOrderProduct[]
  billing_address?: RawYokartOrderAddress | null
  shipping_address?: RawYokartOrderAddress | null
  order_date_added?: string
  order_date_modified?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseMoney(raw: string | number | null | undefined): number | undefined {
  if (raw == null || raw === '') return undefined
  const cleaned =
    typeof raw === 'string' ? raw.replace(/^[^0-9\-.]+/, '').trim() : String(raw)
  const n = parseFloat(cleaned)
  return Number.isNaN(n) ? undefined : n
}

function toMinor(raw: string | number | null | undefined, currency: string): number {
  const n = parseMoney(raw)
  return n == null ? 0 : majorToMinor(n, currency)
}

function inferCurrency(raw: string | number | null | undefined): string {
  if (raw == null) return 'USD'
  const str = String(raw)
  const sym = str.replace(/[\d.,\s-]+/g, '').trim()
  const MAP: Record<string, string> = {
    '€': 'EUR',
    '$': 'USD',
    '£': 'GBP',
    '₹': 'INR',
    '¥': 'JPY',
    '₩': 'KRW',
    'R$': 'BRL',
  }
  return MAP[sym] ?? 'USD'
}

function mapAddress(raw: RawYokartOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.oua_address1 ?? undefined
  const line2 = raw.oua_address2 ?? undefined
  const city = raw.oua_city ?? undefined
  const region = raw.oua_state ?? undefined
  const postalCode = raw.oua_zip ?? undefined
  const country = raw.oua_country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapStatuses(status: string | undefined): {
  financialStatus?: OrderFinancialStatus
  fulfillmentStatus?: OrderFulfillmentStatus
} {
  if (!status) return {}
  switch (status.toLowerCase()) {
    case 'incomplete':
    case 'pending':
    case 'awaiting_payment':
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 'confirmed':
      return { financialStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED' }
    case 'payment_failed':
    case 'cancelled':
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    case 'shipped':
      return { financialStatus: 'PAID', fulfillmentStatus: 'PARTIAL' }
    case 'delivered':
    case 'completed':
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 'refunded':
      return { financialStatus: 'REFUNDED', fulfillmentStatus: 'UNFULFILLED' }
    case 'partially_refunded':
      return { financialStatus: 'PARTIALLY_REFUNDED', fulfillmentStatus: 'UNFULFILLED' }
    default:
      return {}
  }
}

function mapLineItem(raw: RawYokartOrderProduct, currency: string): LineItem {
  const qty = raw.op_qty != null ? parseInt(String(raw.op_qty), 10) : 1
  const unitPrice = toMinor(raw.op_unit_price, currency)
  return {
    id: String(raw.op_id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId: raw.selprod_id != null ? String(raw.selprod_id) : undefined,
    title: raw.product_name ?? 'Unknown',
    quantity: qty > 0 ? qty : 1,
    price: { amount: unitPrice, currency },
    sku: raw.product_model || undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawYokartOrder): Order {
  const currency =
    (raw.order_currency as string | undefined) ??
    inferCurrency(raw.order_total_amount)
  const money = (v: string | number | null | undefined) => ({
    amount: toMinor(v, currency),
    currency,
  })
  const { financialStatus, fulfillmentStatus } = mapStatuses(raw.order_status)
  const isCancelled = raw.order_status?.toLowerCase() === 'cancelled'

  return {
    id: String(raw.order_id),
    orderNumber: raw.order_number ?? undefined,
    name: raw.order_number != null ? `#${raw.order_number}` : undefined,
    customerId: raw.user_id != null ? String(raw.user_id) : undefined,
    email: raw.buyer_email ?? undefined,
    phone: raw.buyer_phone ?? undefined,
    currency,
    subtotalPrice:
      raw.order_subtotal != null ? money(raw.order_subtotal) : undefined,
    totalTax: raw.order_tax != null ? money(raw.order_tax) : undefined,
    totalDiscounts:
      raw.order_discount != null ? money(raw.order_discount) : undefined,
    totalShipping:
      raw.order_shipping != null ? money(raw.order_shipping) : undefined,
    totalPrice:
      raw.order_total_amount != null ? money(raw.order_total_amount) : undefined,
    financialStatus,
    fulfillmentStatus,
    lineItems: (raw.products ?? []).map((p) => mapLineItem(p, currency)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    discountCodes: raw.order_coupon_code ? [raw.order_coupon_code] : undefined,
    createdAt: toIsoDatetime(raw.order_date_added),
    updatedAt: toIsoDatetime(raw.order_date_modified),
    cancelledAt: isCancelled ? toIsoDatetime(raw.order_date_modified) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    user_id: order.customerId,
    buyer_email: order.email,
    buyer_phone: order.phone,
    order_currency: order.currency,
    order_coupon_code: order.discountCodes?.[0],
  }
  if (order.billingAddress) {
    body['billing_address'] = {
      oua_address1: order.billingAddress.line1,
      oua_address2: order.billingAddress.line2,
      oua_city: order.billingAddress.city,
      oua_state: order.billingAddress.region,
      oua_zip: order.billingAddress.postalCode,
      oua_country: order.billingAddress.country,
      oua_phone: order.phone,
    }
  }
  if (order.shippingAddress) {
    body['shipping_address'] = {
      oua_address1: order.shippingAddress.line1,
      oua_address2: order.shippingAddress.line2,
      oua_city: order.shippingAddress.city,
      oua_state: order.shippingAddress.region,
      oua_zip: order.shippingAddress.postalCode,
      oua_country: order.shippingAddress.country,
    }
  }
  if (order.lineItems) {
    body['products'] = order.lineItems.map((li) => ({
      product_id: li.productId,
      selprod_id: li.variantId,
      op_qty: li.quantity,
      product_name: li.title,
      product_model: li.sku,
    }))
  }
  return body
}
