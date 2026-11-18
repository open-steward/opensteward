/**
 * Quickbutik Order → canonical Order.
 *
 * Quickbutik has a single `status` field covering payment and shipping state:
 *   unpaid     → {PENDING,   UNFULFILLED}
 *   paid       → {PAID,      UNFULFILLED}
 *   done       → {PAID,      FULFILLED}
 *   cancelled  → {VOIDED,    UNFULFILLED}
 *
 * Money fields (total_amount, items_amount, etc.) are decimal strings in
 * the store currency. `currency` is a string ISO-4217 code on the order
 * object. Canonical Money.amount is integer minor units.
 *
 * Customer, shipping, and payment details are only present when the order
 * was fetched with `include_details=true`.
 *
 * Docs: https://quickbutik.dev/api-v1/orders
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Quickbutik shapes ──────────────────────────────────────────────────────

export interface RawQuickbutikShippingDetails {
  firstname?: string | null
  lastname?: string | null
  company_name?: string | null
  address?: string | null
  address2?: string | null
  city?: string | null
  zipcode?: string | null
  country?: string | null
  [key: string]: unknown
}

export interface RawQuickbutikCustomer {
  type?: string | null
  email?: string | null
  phone_number?: string | null
  shipping_details?: RawQuickbutikShippingDetails | null
  [key: string]: unknown
}

export interface RawQuickbutikPayment {
  method?: string | null
  transaction_id?: string | null
  [key: string]: unknown
}

export interface RawQuickbutikShipping {
  id?: number | string | null
  name?: string | null
  price?: string | number | null
  trackingnumber?: string | null
  company?: string | null
  [key: string]: unknown
}

export interface RawQuickbutikOrderProduct {
  id: number | string
  product_id?: number | string | null
  variant_id?: number | string | null
  title?: string | null
  price?: string | number | null
  qty?: number | string | null
  sku?: string | null
  variant?: string | null
  [key: string]: unknown
}

export interface RawQuickbutikOrder {
  order_id: number | string
  date_created?: string | null
  status?: string | null
  /** Total order amount including shipping and tax. */
  total_amount?: string | number | null
  /** Product subtotal (items only). */
  items_amount?: string | number | null
  shipping_amount?: string | number | null
  tax_amount?: string | number | null
  currency?: string | null
  is_taxfree?: boolean
  customer?: RawQuickbutikCustomer | null
  payment?: RawQuickbutikPayment | null
  shipping?: RawQuickbutikShipping | null
  products?: RawQuickbutikOrderProduct[] | null
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
  switch (status) {
    case 'unpaid':
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 'paid':
      return { financialStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED' }
    case 'done':
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 'cancelled':
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    default:
      return {}
  }
}

function mapAddress(
  details: RawQuickbutikShippingDetails | null | undefined,
): Address | undefined {
  if (!details) return undefined
  const line1 = details.address ?? undefined
  const line2 = details.address2 ?? undefined
  const city = details.city ?? undefined
  const postalCode = details.zipcode ?? undefined
  const country = details.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, postalCode, country }
}

function mapLineItem(raw: RawQuickbutikOrderProduct, currency: string): LineItem {
  const qty = raw.qty != null ? Number(raw.qty) : 1
  const unitPrice = majorToMinor(toNum(raw.price), currency)

  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId: raw.variant_id != null ? String(raw.variant_id) : undefined,
    title: raw.title ?? '',
    quantity: qty > 0 ? qty : 1,
    price: { amount: unitPrice, currency },
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Convert a Quickbutik datetime string (`"2025-01-29 11:35:39"`) to an
 * ISO 8601 string. Returns undefined for null/empty values.
 */
function toIso(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  // Quickbutik uses space-separated datetime; replace space with 'T' to get
  // a valid ISO 8601 string.
  return raw.replace(' ', 'T') + (raw.includes('T') ? '' : 'Z')
}

export function transformOrder(raw: RawQuickbutikOrder): Order {
  const currency = raw.currency ?? 'SEK'
  const money = (v: string | number | null | undefined) => ({
    amount: majorToMinor(toNum(v), currency),
    currency,
  })
  const { financialStatus, fulfillmentStatus } = mapStatuses(raw.status)
  const customer = raw.customer ?? null

  return {
    id: String(raw.order_id),
    orderNumber: String(raw.order_id),
    name: `#${raw.order_id}`,
    email: customer?.email ?? undefined,
    phone: customer?.phone_number ?? undefined,
    currency,
    subtotalPrice:
      raw.items_amount != null ? money(raw.items_amount) : undefined,
    totalTax: raw.tax_amount != null ? money(raw.tax_amount) : undefined,
    totalShipping: raw.shipping_amount != null ? money(raw.shipping_amount) : undefined,
    totalPrice: raw.total_amount != null ? money(raw.total_amount) : undefined,
    financialStatus,
    fulfillmentStatus,
    lineItems: (raw.products ?? []).map((p) => mapLineItem(p, currency)),
    shippingAddress: mapAddress(customer?.shipping_details),
    billingAddress: mapAddress(customer?.shipping_details),
    createdAt: toIso(raw.date_created),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Quickbutik order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const shippingDetails: Record<string, unknown> = {}
  const addr = order.shippingAddress ?? order.billingAddress
  if (addr) {
    shippingDetails['address'] = addr.line1
    shippingDetails['address2'] = addr.line2
    shippingDetails['city'] = addr.city
    shippingDetails['zipcode'] = addr.postalCode
    shippingDetails['country'] = addr.country
  }

  return {
    customer: {
      email: order.email,
      phone_number: order.phone,
      shipping_details: Object.keys(shippingDetails).length > 0 ? shippingDetails : undefined,
    },
    currency: order.currency,
    products: order.lineItems?.map((li) => ({
      product_id: li.productId,
      variant_id: li.variantId,
      qty: li.quantity,
      title: li.title,
      sku: li.sku,
    })),
  }
}

/** Quickbutik order status update body. */
export function untransformOrderStatus(
  status: string,
  trackingNumber?: string,
  carrier?: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = { status }
  if (trackingNumber || carrier) {
    body['shipping_info'] = {
      trackingnumber: trackingNumber,
      company: carrier,
    }
  }
  return body
}
