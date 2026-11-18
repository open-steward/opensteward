/**
 * BigCommerce Order → canonical Order.
 *
 * BigCommerce Orders use the v2 API. Status is a single string that must
 * be mapped to both financialStatus and fulfillmentStatus on the canonical
 * schema.
 *
 * BigCommerce order statuses:
 *   Incomplete, Pending, Shipped, Partially Shipped, Refunded, Cancelled,
 *   Declined, Awaiting Payment, Awaiting Pickup, Awaiting Shipment,
 *   Completed, Awaiting Fulfillment, Manual Verification Required,
 *   Disputed, Partially Refunded
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ──────────────────────────────────────────────────────────────

export interface RawBigCommerceOrderAddress {
  street_1?: string | null
  street_2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  country_iso2?: string | null
  phone?: string | null
  email?: string | null
}

export interface RawBigCommerceLineItem {
  id: number | string
  product_id?: number | string | null
  variant_id?: number | string | null
  name?: string
  quantity: number
  price_inc_tax?: string | number
  price_ex_tax?: string | number
  total_inc_tax?: string | number
  total_ex_tax?: string | number
  sku?: string | null
  [key: string]: unknown
}

export interface RawBigCommerceOrder {
  id: number | string
  status?: string
  status_id?: number
  customer_id?: number | string
  date_created?: string
  date_modified?: string
  subtotal_inc_tax?: string | number
  subtotal_ex_tax?: string | number
  total_inc_tax?: string | number
  total_ex_tax?: string | number
  total_tax?: string | number
  discount_amount?: string | number
  shipping_cost_inc_tax?: string | number
  shipping_cost_ex_tax?: string | number
  currency_code?: string
  payment_method?: string
  billing_address?: RawBigCommerceOrderAddress | null
  shipping_addresses?: { url?: string } | null
  products?: { url?: string } | null
  order_source?: string
  external_id?: string | null
  custom_status?: string
  staff_notes?: string | null
  customer_message?: string | null
  items_total?: number
  // Inline items when fetched with include
  line_items?: RawBigCommerceLineItem[]
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapAddress(raw: RawBigCommerceOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street_1 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zip ?? undefined
  const country = raw.country_iso2 ?? raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.street_2 ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

/**
 * Map BigCommerce status string to canonical financial status.
 */
function mapFinancialStatus(status: string | undefined): OrderFinancialStatus | undefined {
  if (!status) return undefined
  const s = status.toLowerCase()
  if (s === 'awaiting payment' || s === 'incomplete' || s === 'pending') return 'PENDING'
  if (s === 'manual verification required' || s === 'disputed') return 'AUTHORIZED'
  if (s === 'partially refunded') return 'PARTIALLY_REFUNDED'
  if (s === 'refunded') return 'REFUNDED'
  if (s === 'declined' || s === 'cancelled') return 'VOIDED'
  // Paid statuses: Shipped, Partially Shipped, Completed, Awaiting Pickup,
  // Awaiting Shipment, Awaiting Fulfillment
  return 'PAID'
}

/**
 * Map BigCommerce status string to canonical fulfillment status.
 */
function mapFulfillmentStatus(status: string | undefined): OrderFulfillmentStatus | undefined {
  if (!status) return undefined
  const s = status.toLowerCase()
  if (s === 'shipped' || s === 'completed') return 'FULFILLED'
  if (s === 'partially shipped') return 'PARTIAL'
  if (s === 'cancelled' || s === 'refunded') return 'RESTOCKED'
  // Unfulfilled: Pending, Awaiting Payment, Awaiting Shipment,
  // Awaiting Fulfillment, Awaiting Pickup, etc.
  return 'UNFULFILLED'
}

function mapLineItem(raw: RawBigCommerceLineItem, currency: string): LineItem {
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId: raw.variant_id != null ? String(raw.variant_id) : undefined,
    title: raw.name ?? '',
    quantity: raw.quantity,
    price: { amount: majorToMinor(toNum(raw.price_ex_tax ?? raw.price_inc_tax), currency), currency },
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformOrder(raw: RawBigCommerceOrder): Order {
  const currency = raw.currency_code ?? 'USD'
  const money = (v: string | number | null | undefined) => ({ amount: majorToMinor(toNum(v), currency), currency })

  return {
    id: String(raw.id),
    orderNumber: raw.id != null ? String(raw.id) : undefined,
    customerId: raw.customer_id != null ? String(raw.customer_id) : undefined,
    email: raw.billing_address?.email ?? undefined,
    currency,
    subtotalPrice:
      raw.subtotal_ex_tax != null
        ? money(raw.subtotal_ex_tax)
        : raw.subtotal_inc_tax != null
          ? money(raw.subtotal_inc_tax)
          : undefined,
    totalTax: raw.total_tax != null ? money(raw.total_tax) : undefined,
    totalDiscounts: raw.discount_amount != null ? money(raw.discount_amount) : undefined,
    totalShipping:
      raw.shipping_cost_ex_tax != null
        ? money(raw.shipping_cost_ex_tax)
        : raw.shipping_cost_inc_tax != null
          ? money(raw.shipping_cost_inc_tax)
          : undefined,
    totalPrice:
      raw.total_inc_tax != null
        ? money(raw.total_inc_tax)
        : raw.total_ex_tax != null
          ? money(raw.total_ex_tax)
          : undefined,
    financialStatus: mapFinancialStatus(raw.status),
    fulfillmentStatus: mapFulfillmentStatus(raw.status),
    lineItems: (raw.line_items ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billing_address),
    note: raw.customer_message ?? raw.staff_notes ?? undefined,
    createdAt: raw.date_created,
    updatedAt: raw.date_modified,
    cancelledAt: raw.status?.toLowerCase() === 'cancelled' ? raw.date_modified : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → BigCommerce order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    customer_id: order.customerId ? Number(order.customerId) : undefined,
    customer_message: order.note,
  }
  if (order.lineItems) {
    body.products = order.lineItems.map((li) => ({
      product_id: li.productId ? Number(li.productId) : undefined,
      variant_id: li.variantId ? Number(li.variantId) : undefined,
      quantity: li.quantity,
      // Canonical price is integer minor units; BigCommerce expects a decimal major-unit value.
      price_ex_tax: li.price?.amount != null ? li.price.amount / 100 : undefined,
      name: li.title,
    }))
  }
  if (order.billingAddress) {
    const a = order.billingAddress
    body.billing_address = {
      street_1: a.line1,
      street_2: a.line2,
      city: a.city,
      state: a.region,
      zip: a.postalCode,
      country_iso2: a.country,
      email: order.email,
    }
  }
  return body
}
