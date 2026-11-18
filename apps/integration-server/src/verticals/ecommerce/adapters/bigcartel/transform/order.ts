/**
 * Big Cartel Order → canonical Order.
 *
 * Big Cartel orders are read-only via the API. The data model is simple:
 * orders have a status, buyer info, line items, shipping/billing addresses,
 * and totals.
 *
 * Statuses: 'pending', 'completed', 'shipped', 'cancelled', 'refunded'
 * Big Cartel merges financial and fulfillment into a single status, which
 * we split into the canonical pair.
 *
 * Docs: https://developers.bigcartel.com/
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Big Cartel shapes ──────────────────────────────────────────────────

export interface RawBigCartelAddress {
  first_name?: string | null
  last_name?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
}

export interface RawBigCartelLineItem {
  id?: string | number
  product_name?: string
  product_id?: string | number
  quantity?: number
  unit_price?: string | number
  total_price?: string | number
}

export interface RawBigCartelOrder {
  id: string | number
  type?: string
  attributes?: {
    order_number?: string | number
    status?: string
    customer_email?: string | null
    customer_first_name?: string | null
    customer_last_name?: string | null
    customer_phone?: string | null
    subtotal?: string | number | null
    total?: string | number | null
    discount?: string | number | null
    shipping_total?: string | number | null
    tax_total?: string | number | null
    currency?: string
    shipping_address?: RawBigCartelAddress | null
    billing_address?: RawBigCartelAddress | null
    items?: RawBigCartelLineItem[]
    customer_note?: string | null
    created_at?: string
    updated_at?: string
    completed_at?: string | null
  }
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapAddress(raw: RawBigCartelAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zip ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address2 ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

function mapStatuses(status: string | undefined): {
  financialStatus?: OrderFinancialStatus
  fulfillmentStatus?: OrderFulfillmentStatus
} {
  if (!status) return {}
  switch (status.toLowerCase()) {
    case 'pending':
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 'completed':
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 'shipped':
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 'cancelled':
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    case 'refunded':
      return { financialStatus: 'REFUNDED', fulfillmentStatus: 'UNFULFILLED' }
    default:
      return {}
  }
}

function mapLineItem(raw: RawBigCartelLineItem, currency: string): LineItem {
  const qty = raw.quantity ?? 1
  const unitPrice = toNum(raw.unit_price)
  return {
    id: raw.id != null ? String(raw.id) : '0',
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    title: raw.product_name ?? '',
    quantity: qty,
    price: { amount: majorToMinor(unitPrice, currency), currency },
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawBigCartelOrder): Order {
  const attrs = raw.attributes ?? {}
  const currency = attrs.currency ?? 'USD'
  const money = (v: string | number | null | undefined) => ({
    amount: majorToMinor(toNum(v), currency),
    currency,
  })
  const { financialStatus, fulfillmentStatus } = mapStatuses(attrs.status)
  const orderNum =
    attrs.order_number != null ? String(attrs.order_number) : undefined

  return {
    id: String(raw.id),
    orderNumber: orderNum,
    name: orderNum != null ? `#${orderNum}` : undefined,
    email: attrs.customer_email ?? undefined,
    phone: attrs.customer_phone ?? undefined,
    currency,
    subtotalPrice: attrs.subtotal != null ? money(attrs.subtotal) : undefined,
    totalTax: attrs.tax_total != null ? money(attrs.tax_total) : undefined,
    totalDiscounts: attrs.discount != null ? money(attrs.discount) : undefined,
    totalShipping:
      attrs.shipping_total != null ? money(attrs.shipping_total) : undefined,
    totalPrice: attrs.total != null ? money(attrs.total) : undefined,
    financialStatus,
    fulfillmentStatus,
    lineItems: (attrs.items ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(attrs.billing_address),
    shippingAddress: mapAddress(attrs.shipping_address),
    note: attrs.customer_note ?? undefined,
    createdAt: attrs.created_at,
    updatedAt: attrs.updated_at,
    processedAt: attrs.completed_at ?? undefined,
    cancelledAt:
      attrs.status === 'cancelled' ? attrs.updated_at : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Big Cartel order body (for update — orders are mostly read-only). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (order.note != null) attributes['customer_note'] = order.note
  return { data: { type: 'orders', attributes } }
}
