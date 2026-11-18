/**
 * IZBERG MerchantOrder → canonical Order.
 *
 * IZBERG separates marketplace orders into two levels:
 *
 *  - `order`          — the buyer-facing order covering all merchants.
 *    Endpoint: GET /v1/order/{id}/
 *  - `merchant_order` — the merchant-scoped slice of the order. Merchants
 *    use this endpoint to list/confirm/ship their portion of an order.
 *    Endpoint: GET /v1/merchant_order/, GET /v1/merchant_order/{id}/
 *
 * We surface `merchant_order` as the canonical Order because that is the
 * resource merchants interact with. Financial and fulfillment status are
 * derived from the merchant_order `status` field.
 *
 * IZBERG merchant_order statuses:
 *   "waiting_acceptance" / "waiting_debit" → {PENDING, UNFULFILLED}
 *   "payment_refused" / "cancelled"        → {VOIDED, UNFULFILLED}
 *   "accepted"                             → {PAID, UNFULFILLED}
 *   "shipping"                             → {PAID, PARTIAL}
 *   "shipped" / "completed"                → {PAID, FULFILLED}
 *   "refunded"                             → {REFUNDED, UNFULFILLED}
 *
 * Prices come as decimal major-unit strings; canonical Money uses minor units.
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

// ── Raw IZBERG shapes ────────────────────────────────────────────────────────

export interface RawIzbergAddress {
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  address?: string | null
  address2?: string | null
  zipcode?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  phone?: string | null
}

export interface RawIzbergOrderItem {
  id: number | string
  product_name?: string | null
  offer_name?: string | null
  variation_name?: string | null
  quantity?: number
  base_price?: string | number | null
  price?: string | number | null
  total_price?: string | number | null
  offer_sku?: string | null
  product_id?: number | string | null
  offer_id?: number | string | null
  variation_id?: number | string | null
  [key: string]: unknown
}

export interface RawIzbergMerchantOrder {
  id: number | string
  resource_uri?: string
  order?: number | string | null
  order_number?: string | null
  status?: string | null
  currency?: string | null
  total_price?: string | number | null
  items?: RawIzbergOrderItem[]
  order_items?: RawIzbergOrderItem[]
  billing_address?: RawIzbergAddress | null
  shipping_address?: RawIzbergAddress | null
  customer_email?: string | null
  customer_phone?: string | null
  date_placed?: string | null
  date_modified?: string | null
  tracking_number?: string | null
  tracking_url?: string | null
  carrier?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapStatuses(status: string | null | undefined): {
  financialStatus?: OrderFinancialStatus
  fulfillmentStatus?: OrderFulfillmentStatus
} {
  if (!status) return {}
  switch (status.toLowerCase()) {
    case 'waiting_acceptance':
    case 'waiting_debit':
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 'payment_refused':
    case 'cancelled':
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    case 'accepted':
      return { financialStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED' }
    case 'shipping':
      return { financialStatus: 'PAID', fulfillmentStatus: 'PARTIAL' }
    case 'shipped':
    case 'completed':
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 'refunded':
      return { financialStatus: 'REFUNDED', fulfillmentStatus: 'UNFULFILLED' }
    default:
      return {}
  }
}

function mapAddress(raw: RawIzbergAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.zipcode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapLineItem(raw: RawIzbergOrderItem, currency: string): LineItem {
  const unitPrice = majorToMinor(toNum(raw.base_price ?? raw.price), currency)
  const title = raw.product_name ?? raw.offer_name ?? String(raw.id)
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId: raw.variation_id != null ? String(raw.variation_id) : undefined,
    title,
    quantity: raw.quantity ?? 1,
    price: { amount: unitPrice, currency },
    sku: raw.offer_sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawIzbergMerchantOrder): Order {
  const currency = raw.currency ?? 'EUR'
  const { financialStatus, fulfillmentStatus } = mapStatuses(raw.status)
  const lineItemsRaw = raw.items ?? raw.order_items ?? []
  const lineItems = lineItemsRaw.map((li) => mapLineItem(li, currency))

  return {
    id: String(raw.id),
    orderNumber: raw.order_number ?? undefined,
    name: raw.order_number != null ? `#${raw.order_number}` : undefined,
    email: raw.customer_email ?? undefined,
    phone: raw.customer_phone ?? undefined,
    currency,
    totalPrice:
      raw.total_price != null
        ? { amount: majorToMinor(toNum(raw.total_price), currency), currency }
        : undefined,
    financialStatus,
    fulfillmentStatus,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    createdAt: toIsoDatetime(raw.date_placed),
    updatedAt: toIsoDatetime(raw.date_modified),
    cancelledAt:
      raw.status === 'cancelled' ? toIsoDatetime(raw.date_modified) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → IZBERG merchant_order patch body. */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    customer_email: order.email,
    customer_phone: order.phone,
    shipping_address: order.shippingAddress
      ? {
          address: order.shippingAddress.line1,
          address2: order.shippingAddress.line2,
          city: order.shippingAddress.city,
          state: order.shippingAddress.region,
          zipcode: order.shippingAddress.postalCode,
          country: order.shippingAddress.country,
        }
      : undefined,
  }
}
