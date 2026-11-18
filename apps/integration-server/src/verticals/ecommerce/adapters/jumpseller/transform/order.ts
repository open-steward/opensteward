/**
 * Jumpseller Order → canonical Order.
 *
 * API:
 *  - GET  /orders.json                     → paginated array
 *  - GET  /orders/{id}.json                → single order
 *  - POST /orders.json                     → create order
 *  - PUT  /orders/{id}.json                → update order (status, tracking, etc.)
 *  - GET  /orders/status/{status}.json     → filter by status
 *
 * Key fields: id, status, shipment_status, tracking_number, tracking_company,
 *             total, subtotal, shipping_total, tax, currency, created_at,
 *             updated_at, customer, billing_address, shipping_address, products.
 *
 * Jumpseller order statuses: "Pending", "Paid", "Processing", "Shipped",
 *   "Delivered", "Canceled", "Refunded" (+ more).
 * Jumpseller amounts are decimal major units.
 *
 * Docs: https://jumpseller.com/support/api/
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawJumpsellerOrderAddress {
  name?: string | null
  surname?: string | null
  address?: string | null
  street_number?: string | null
  complement?: string | null
  city?: string | null
  postal?: string | null
  region?: string | null
  region_code?: string | null
  country?: string | null
  country_code?: string | null
  [key: string]: unknown
}

export interface RawJumpsellerOrderProduct {
  id: number | string
  variant_id?: number | string | null
  name?: string
  qty?: number
  price?: number | string
  discount?: number | string
  sku?: string | null
  weight?: number | null
  tax?: number | string
  [key: string]: unknown
}

export interface RawJumpsellerOrderCustomer {
  id?: number | string
  email?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface RawJumpsellerOrder {
  id: number | string
  status?: string | null
  shipment_status?: string | null
  tracking_number?: string | null
  tracking_company?: string | null
  total?: number | string | null
  subtotal?: number | string | null
  shipping_total?: number | string | null
  tax?: number | string | null
  discount?: number | string | null
  currency?: string | null
  customer?: RawJumpsellerOrderCustomer | null
  billing_address?: RawJumpsellerOrderAddress | null
  shipping_address?: RawJumpsellerOrderAddress | null
  products?: RawJumpsellerOrderProduct[]
  payment_method_name?: string | null
  shipping_method_name?: string | null
  additional_information?: string | null
  coupon_code?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function toMinor(v: number | string | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

function mapAddress(raw: RawJumpsellerOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = [raw.address, raw.street_number].filter(Boolean).join(' ') || undefined
  const line2 = raw.complement ?? undefined
  const city = raw.city ?? undefined
  const region = raw.region ?? raw.region_code ?? undefined
  const postalCode = raw.postal ?? undefined
  const country = raw.country_code ?? raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

/**
 * Map Jumpseller order status to canonical financial + fulfillment statuses.
 *
 * Jumpseller combines payment and shipment state in a single "status" field:
 *   Pending    → PENDING / UNFULFILLED
 *   Paid       → PAID / UNFULFILLED
 *   Processing → PAID / UNFULFILLED
 *   Shipped    → PAID / FULFILLED
 *   Delivered  → PAID / FULFILLED
 *   Canceled   → VOIDED / UNFULFILLED
 *   Refunded   → REFUNDED / UNFULFILLED
 */
function mapStatuses(status: string | null | undefined): {
  financialStatus: OrderFinancialStatus | undefined
  fulfillmentStatus: OrderFulfillmentStatus | undefined
} {
  if (!status) return { financialStatus: undefined, fulfillmentStatus: undefined }
  const lower = status.toLowerCase()
  const fin: Record<string, OrderFinancialStatus> = {
    pending: 'PENDING',
    paid: 'PAID',
    processing: 'PAID',
    shipped: 'PAID',
    delivered: 'PAID',
    canceled: 'VOIDED',
    cancelled: 'VOIDED',
    refunded: 'REFUNDED',
  }
  const ful: Record<string, OrderFulfillmentStatus> = {
    pending: 'UNFULFILLED',
    paid: 'UNFULFILLED',
    processing: 'UNFULFILLED',
    shipped: 'FULFILLED',
    delivered: 'FULFILLED',
    canceled: 'UNFULFILLED',
    cancelled: 'UNFULFILLED',
    refunded: 'UNFULFILLED',
  }
  return {
    financialStatus: fin[lower] ?? undefined,
    fulfillmentStatus: ful[lower] ?? undefined,
  }
}

function mapLineItem(raw: RawJumpsellerOrderProduct, currency: string): LineItem {
  return {
    id: String(raw.id),
    productId: String(raw.id),
    variantId: raw.variant_id != null ? String(raw.variant_id) : undefined,
    title: raw.name ?? '',
    quantity: raw.qty ?? 1,
    price: { amount: toMinor(raw.price, currency), currency },
    totalDiscount:
      raw.discount != null && toNum(raw.discount) !== 0
        ? { amount: toMinor(raw.discount, currency), currency }
        : undefined,
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawJumpsellerOrder): Order {
  const currency = raw.currency ?? 'USD'
  const money = (v: number | string | null | undefined) => ({
    amount: toMinor(v, currency),
    currency,
  })
  const { financialStatus, fulfillmentStatus } = mapStatuses(raw.status)
  const lineItems = (raw.products ?? []).map((p) => mapLineItem(p, currency))

  const discountCodes = raw.coupon_code ? [raw.coupon_code] : undefined

  return {
    id: String(raw.id),
    customerId: raw.customer?.id != null ? String(raw.customer.id) : undefined,
    email: raw.customer?.email ?? undefined,
    phone: raw.customer?.phone ?? undefined,
    currency,
    subtotalPrice: raw.subtotal != null ? money(raw.subtotal) : undefined,
    totalTax: raw.tax != null ? money(raw.tax) : undefined,
    totalDiscounts: raw.discount != null ? money(raw.discount) : undefined,
    totalShipping: raw.shipping_total != null ? money(raw.shipping_total) : undefined,
    totalPrice: raw.total != null ? money(raw.total) : undefined,
    financialStatus,
    fulfillmentStatus,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    discountCodes,
    note: raw.additional_information ?? undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    status: order.financialStatus === 'PAID' ? 'Paid' : 'Pending',
    additional_information: order.note,
    products: order.lineItems?.map((li) => ({
      id: li.productId,
      variant_id: li.variantId,
      qty: li.quantity,
      // Jumpseller expects decimal major-unit prices.
      price:
        li.price?.amount != null
          ? minorToMajor(li.price.amount, li.price.currency)
          : undefined,
      name: li.title,
      sku: li.sku,
    })),
    customer: order.customerId ? { id: order.customerId } : undefined,
    coupon_code: order.discountCodes?.[0],
  }
}
