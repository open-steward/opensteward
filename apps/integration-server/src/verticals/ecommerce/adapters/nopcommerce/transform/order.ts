/**
 * nopCommerce Order → canonical Order.
 *
 * nopCommerce orders carry a single `order_status` string plus a
 * `payment_status` string. We combine them into the canonical
 * financial + fulfillment pair:
 *
 *   payment_status "Pending"   → financialStatus: PENDING
 *   payment_status "Paid"      → financialStatus: PAID
 *   payment_status "Authorized"→ financialStatus: AUTHORIZED
 *   payment_status "Refunded"  → financialStatus: REFUNDED
 *   payment_status "Voided"    → financialStatus: VOIDED
 *   payment_status "PartiallyRefunded" → financialStatus: PARTIALLY_REFUNDED
 *
 *   order_status "Pending"     → fulfillmentStatus: UNFULFILLED
 *   order_status "Processing"  → fulfillmentStatus: UNFULFILLED
 *   order_status "Complete"    → fulfillmentStatus: FULFILLED
 *   order_status "Cancelled"   → fulfillmentStatus: UNFULFILLED
 *
 * Line items are under `order_items`. Money fields are numeric.
 *
 * API: `/api/orders` returns `{ orders: [...] }`
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw nopCommerce shapes ──────────────────────────────────────────────────

export interface RawNopOrderAddress {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  company?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state_province_name?: string | null
  zip_postal_code?: string | null
  country?: string | null
  phone_number?: string | null
}

export interface RawNopOrderItem {
  id: number | string
  product_id?: number | string
  quantity: number
  unit_price_incl_tax?: number
  unit_price_excl_tax?: number
  price_incl_tax?: number
  price_excl_tax?: number
  discount_amount_incl_tax?: number
  discount_amount_excl_tax?: number
  sku?: string | null
  attribute_description?: string | null
  [key: string]: unknown
}

export interface RawNopOrder {
  id: number | string
  custom_order_number?: string | null
  order_status?: string
  payment_status?: string
  shipping_status?: string
  customer_id?: number | string
  customer_email?: string | null
  billing_address?: RawNopOrderAddress | null
  shipping_address?: RawNopOrderAddress | null
  order_subtotal_incl_tax?: number
  order_subtotal_excl_tax?: number
  order_shipping_incl_tax?: number
  order_shipping_excl_tax?: number
  order_tax?: number
  order_discount?: number
  order_total?: number
  customer_currency_code?: string
  order_items?: RawNopOrderItem[]
  order_notes?: Array<{ note?: string; created_on_utc?: string }>
  created_on_utc?: string
  updated_on_utc?: string
  paid_date_utc?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: RawNopOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state_province_name ?? undefined
  const postalCode = raw.zip_postal_code ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapFinancialStatus(
  paymentStatus: string | undefined,
): OrderFinancialStatus | undefined {
  if (!paymentStatus) return undefined
  switch (paymentStatus.toLowerCase()) {
    case 'pending':
      return 'PENDING'
    case 'authorized':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'partiallypaid':
      return 'PARTIALLY_PAID'
    case 'partiallyrefunded':
      return 'PARTIALLY_REFUNDED'
    case 'refunded':
      return 'REFUNDED'
    case 'voided':
      return 'VOIDED'
    default:
      return undefined
  }
}

function mapFulfillmentStatus(
  orderStatus: string | undefined,
  shippingStatus: string | undefined,
): OrderFulfillmentStatus | undefined {
  // Prefer shipping status when available
  if (shippingStatus) {
    switch (shippingStatus.toLowerCase()) {
      case 'shipped':
      case 'delivered':
        return 'FULFILLED'
      case 'partiallyshipped':
        return 'PARTIAL'
      case 'notyet':
      case 'shippingnotrequired':
        return 'UNFULFILLED'
    }
  }
  if (!orderStatus) return undefined
  switch (orderStatus.toLowerCase()) {
    case 'pending':
    case 'processing':
      return 'UNFULFILLED'
    case 'complete':
      return 'FULFILLED'
    case 'cancelled':
      return 'UNFULFILLED'
    default:
      return undefined
  }
}

function mapLineItem(raw: RawNopOrderItem, currency: string): LineItem {
  const unitPrice = raw.unit_price_incl_tax ?? raw.unit_price_excl_tax ?? 0
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    title: raw.attribute_description ?? `Product ${raw.product_id ?? raw.id}`,
    quantity: raw.quantity,
    price: { amount: majorToMinor(unitPrice, currency), currency },
    totalDiscount:
      raw.discount_amount_incl_tax != null && raw.discount_amount_incl_tax > 0
        ? { amount: majorToMinor(raw.discount_amount_incl_tax, currency), currency }
        : undefined,
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawNopOrder): Order {
  const currency = raw.customer_currency_code ?? 'USD'
  const money = (v: number | undefined) =>
    v != null ? { amount: majorToMinor(v, currency), currency } : undefined

  return {
    id: String(raw.id),
    orderNumber: raw.custom_order_number ?? String(raw.id),
    name: raw.custom_order_number
      ? `#${raw.custom_order_number}`
      : `#${raw.id}`,
    customerId:
      raw.customer_id != null ? String(raw.customer_id) : undefined,
    email: raw.customer_email ?? raw.billing_address?.email ?? undefined,
    phone: raw.billing_address?.phone_number ?? undefined,
    currency,
    subtotalPrice: money(raw.order_subtotal_incl_tax ?? raw.order_subtotal_excl_tax),
    totalTax: money(raw.order_tax),
    totalDiscounts: money(raw.order_discount),
    totalShipping: money(raw.order_shipping_incl_tax ?? raw.order_shipping_excl_tax),
    totalPrice: money(raw.order_total),
    financialStatus: mapFinancialStatus(raw.payment_status),
    fulfillmentStatus: mapFulfillmentStatus(raw.order_status, raw.shipping_status),
    lineItems: (raw.order_items ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    note:
      raw.order_notes && raw.order_notes.length > 0
        ? raw.order_notes[0]!.note ?? undefined
        : undefined,
    createdAt: raw.created_on_utc,
    updatedAt: raw.updated_on_utc,
    processedAt: raw.paid_date_utc ?? undefined,
    cancelledAt:
      raw.order_status?.toLowerCase() === 'cancelled'
        ? raw.updated_on_utc
        : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → nopCommerce order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const billing: Record<string, unknown> | undefined = order.billingAddress
    ? {
        address1: order.billingAddress.line1,
        address2: order.billingAddress.line2,
        city: order.billingAddress.city,
        state_province_name: order.billingAddress.region,
        zip_postal_code: order.billingAddress.postalCode,
        country: order.billingAddress.country,
        email: order.email,
        phone_number: order.phone,
      }
    : undefined

  const shipping: Record<string, unknown> | undefined = order.shippingAddress
    ? {
        address1: order.shippingAddress.line1,
        address2: order.shippingAddress.line2,
        city: order.shippingAddress.city,
        state_province_name: order.shippingAddress.region,
        zip_postal_code: order.shippingAddress.postalCode,
        country: order.shippingAddress.country,
      }
    : undefined

  return {
    customer_currency_code: order.currency,
    customer_id: order.customerId,
    billing_address: billing,
    shipping_address: shipping,
    order_items: order.lineItems?.map((li) => ({
      product_id: li.productId,
      quantity: li.quantity,
      unit_price_incl_tax: li.price?.amount != null ? li.price.amount / 100 : undefined,
      sku: li.sku,
    })),
  }
}
