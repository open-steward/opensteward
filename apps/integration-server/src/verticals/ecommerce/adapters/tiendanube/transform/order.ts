/**
 * Tiendanube / Nuvemshop Order → canonical Order.
 *
 * Key differences from Shopify:
 *  - `payment_status` rather than `financial_status` for payment state.
 *  - `shipping_status` for fulfillment state.
 *  - Line items live in `products` (not `line_items`).
 *  - Billing address is flat (not nested): `billing_address`, `billing_city`, etc.
 *  - Shipping address is nested under `shipping_address`.
 *  - `subtotal`, `total`, `discount` are decimal strings (major-unit).
 *  - `coupon` is an array of applied coupon codes.
 *  - `number` is the display order number.
 *  - Dates are ISO 8601 strings.
 *
 * Docs: https://tiendanube.github.io/api-documentation/resources/order
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawTiendanubeShippingAddress {
  address?: string | null
  number?: string | null
  floor?: string | null
  locality?: string | null
  city?: string | null
  province?: string | null
  zipcode?: string | null
  country?: string | null
  name?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface RawTiendanubeOrderProduct {
  id: number | string
  product_id?: number | string | null
  variant_id?: number | string | null
  name?: string | null
  price?: string | number
  quantity?: string | number
  sku?: string | null
  [key: string]: unknown
}

export interface RawTiendanubeCoupon {
  code?: string
  [key: string]: unknown
}

export interface RawTiendanubeOrderCustomer {
  id?: number | string
  name?: string | null
  email?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface RawTiendanubeOrder {
  id: number | string
  number?: number | string
  token?: string
  store_id?: string | number
  status?: string | null
  payment_status?: string | null
  shipping_status?: string | null
  contact_email?: string | null
  contact_name?: string | null
  contact_phone?: string | null
  currency?: string
  subtotal?: string | number
  discount?: string | number
  total?: string | number
  // Billing address is flat on the order
  billing_address?: string | null
  billing_number?: string | null
  billing_floor?: string | null
  billing_locality?: string | null
  billing_zipcode?: string | null
  billing_city?: string | null
  billing_province?: string | null
  billing_country?: string | null
  billing_phone?: string | null
  shipping_address?: RawTiendanubeShippingAddress | null
  products?: RawTiendanubeOrderProduct[]
  coupon?: RawTiendanubeCoupon[]
  customer?: RawTiendanubeOrderCustomer | null
  note?: string | null
  owner_note?: string | null
  gateway?: string | null
  gateway_name?: string | null
  cancel_reason?: string | null
  created_at?: string
  updated_at?: string
  completed_at?: string | { date: string } | null
  cancelled_at?: string | null
  closed_at?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function toMinor(v: string | number | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

// ── Status maps ───────────────────────────────────────────────────────────────

const PAYMENT_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  pending: 'PENDING',
  authorized: 'AUTHORIZED',
  paid: 'PAID',
  voided: 'VOIDED',
  refunded: 'REFUNDED',
  partially_refunded: 'PARTIALLY_REFUNDED',
  in_process: 'PENDING',
  in_mediation: 'PENDING',
  rejected: 'VOIDED',
  // Tiendanube-specific
  abandoned: 'PENDING',
}

const SHIPPING_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  unpacked: 'UNFULFILLED',
  unshipped: 'UNFULFILLED',
  partial: 'PARTIAL',
  packed: 'PARTIAL',
  shipped: 'FULFILLED',
  delivered: 'FULFILLED',
  returned: 'RESTOCKED',
}

// ── Address helpers ───────────────────────────────────────────────────────────

function mapBillingAddress(raw: RawTiendanubeOrder): Address | undefined {
  const line1 = raw.billing_address ?? undefined
  const city = raw.billing_city ?? undefined
  const postalCode = raw.billing_zipcode ?? undefined
  const country = raw.billing_country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1: [line1, raw.billing_number].filter(Boolean).join(' ') || undefined,
    line2: raw.billing_floor ?? undefined,
    city,
    region: raw.billing_province ?? undefined,
    postalCode,
    country,
  }
}

function mapShippingAddress(
  raw: RawTiendanubeShippingAddress | null | undefined,
): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zipcode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1: [line1, raw.number].filter(Boolean).join(' ') || undefined,
    line2: raw.floor ?? undefined,
    city,
    region: raw.province ?? undefined,
    postalCode,
    country,
  }
}

// ── Line item helper ──────────────────────────────────────────────────────────

function mapLineItem(raw: RawTiendanubeOrderProduct, currency: string): LineItem {
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId: raw.variant_id != null ? String(raw.variant_id) : undefined,
    title: raw.name ?? '',
    quantity: typeof raw.quantity === 'string' ? parseInt(raw.quantity, 10) : (raw.quantity ?? 0),
    price: { amount: toMinor(raw.price, currency), currency },
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawTiendanubeOrder): Order {
  const currency = raw.currency ?? 'USD'
  const money = (v: string | number | null | undefined) => ({
    amount: toMinor(v, currency),
    currency,
  })

  return {
    id: String(raw.id),
    orderNumber: raw.number != null ? String(raw.number) : undefined,
    customerId: raw.customer?.id != null ? String(raw.customer.id) : undefined,
    email: raw.contact_email ?? raw.customer?.email ?? undefined,
    phone: raw.contact_phone ?? raw.customer?.phone ?? undefined,
    currency,
    subtotalPrice: raw.subtotal != null ? money(raw.subtotal) : undefined,
    totalDiscounts: raw.discount != null ? money(raw.discount) : undefined,
    totalPrice: raw.total != null ? money(raw.total) : undefined,
    financialStatus: raw.payment_status
      ? PAYMENT_STATUS_MAP[raw.payment_status.toLowerCase()] ?? undefined
      : undefined,
    fulfillmentStatus: raw.shipping_status
      ? SHIPPING_STATUS_MAP[raw.shipping_status.toLowerCase()] ?? undefined
      : undefined,
    lineItems: (raw.products ?? []).map((p) => mapLineItem(p, currency)),
    billingAddress: mapBillingAddress(raw),
    shippingAddress: mapShippingAddress(raw.shipping_address),
    discountCodes: raw.coupon
      ?.map((c) => c.code)
      .filter((c): c is string => !!c),
    note: raw.note ?? undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    cancelledAt: raw.cancelled_at ?? undefined,
    cancelReason: raw.cancel_reason ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Tiendanube order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    contact_email: order.email,
    contact_phone: order.phone,
    currency: order.currency,
    note: order.note,
    products: order.lineItems?.map((li) => ({
      variant_id: li.variantId,
      quantity: li.quantity,
      price: li.price?.amount != null
        ? (li.price.amount / 100).toFixed(2)
        : undefined,
      name: li.title,
      sku: li.sku,
    })),
  }
}
