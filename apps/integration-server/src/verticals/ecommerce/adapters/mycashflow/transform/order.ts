/**
 * MyCashflow Order → canonical Order.
 *
 * MyCashflow order objects carry:
 *  - `id`, `status` (open / cancelled / etc.), `payment_status` (paid / unpaid)
 *  - `customer_id`, `email`, `currency`
 *  - `total`, `subtotal`, `total_tax`, `shipping_cost`
 *  - `order_rows` array of line items
 *  - `billing_address`, `shipping_address` nested objects
 *  - `created_at`, `updated_at`
 *
 * All money values are decimal major-unit numbers (e.g. 29.90 EUR) converted
 * to integer minor units via `majorToMinor`.
 *
 * Docs: https://support.mycashflow.com/api/11-orders/
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw MyCashflow shapes ────────────────────────────────────────────────────

export interface RawMyCashflowOrderAddress {
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  address?: string | null
  address2?: string | null
  city?: string | null
  region?: string | null
  postal_code?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

export interface RawMyCashflowOrderRow {
  id: number | string
  product_id?: number | string | null
  variation_id?: number | string | null
  name?: string
  code?: string | null
  quantity?: number
  unit_price?: number | null
  price?: number | null
  total?: number | null
  tax_rate?: number | null
  [key: string]: unknown
}

export interface RawMyCashflowOrder {
  id: number | string
  /** Overall order lifecycle status: "open", "cancelled", "archived", etc. */
  status?: string | null
  /**
   * Payment / financial status.
   * MyCashflow tracks payment separately — common values: "paid", "unpaid",
   * "partial", "refunded".
   */
  payment_status?: string | null
  customer_id?: number | string | null
  email?: string | null
  phone?: string | null
  currency?: string | null
  total?: number | null
  subtotal?: number | null
  total_tax?: number | null
  shipping_cost?: number | null
  discount_total?: number | null
  order_rows?: RawMyCashflowOrderRow[]
  billing_address?: RawMyCashflowOrderAddress | null
  shipping_address?: RawMyCashflowOrderAddress | null
  note?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMinor(v: number | null | undefined, currency: string): number {
  if (v == null) return 0
  return majorToMinor(v, currency)
}

function mapAddress(
  raw: RawMyCashflowOrderAddress | null | undefined,
): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.region ?? undefined
  const postalCode = raw.postal_code ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapFinancialStatus(
  paymentStatus: string | null | undefined,
  orderStatus: string | null | undefined,
): OrderFinancialStatus | undefined {
  const ps = (paymentStatus ?? '').toLowerCase()
  const os = (orderStatus ?? '').toLowerCase()
  if (os === 'cancelled') return 'VOIDED'
  switch (ps) {
    case 'paid':
      return 'PAID'
    case 'partial':
      return 'PARTIALLY_PAID'
    case 'refunded':
      return 'REFUNDED'
    case 'unpaid':
    case 'pending':
      return 'PENDING'
    default:
      return undefined
  }
}

function mapFulfillmentStatus(
  orderStatus: string | null | undefined,
): OrderFulfillmentStatus | undefined {
  const s = (orderStatus ?? '').toLowerCase()
  switch (s) {
    case 'delivered':
    case 'completed':
      return 'FULFILLED'
    case 'partially_delivered':
      return 'PARTIAL'
    case 'cancelled':
      return 'UNFULFILLED'
    case 'open':
    case 'processing':
      return 'UNFULFILLED'
    default:
      return undefined
  }
}

function mapLineItem(raw: RawMyCashflowOrderRow, currency: string): LineItem {
  const unitPrice = raw.unit_price ?? raw.price ?? 0
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId: raw.variation_id != null ? String(raw.variation_id) : undefined,
    title: raw.name ?? '',
    quantity: raw.quantity ?? 1,
    price: { amount: toMinor(unitPrice, currency), currency },
    sku: raw.code ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawMyCashflowOrder): Order {
  const currency = raw.currency ?? 'EUR'
  const money = (v: number | null | undefined) =>
    v != null ? { amount: toMinor(v, currency), currency } : undefined

  return {
    id: String(raw.id),
    customerId:
      raw.customer_id != null && raw.customer_id !== 0
        ? String(raw.customer_id)
        : undefined,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    currency,
    subtotalPrice: money(raw.subtotal),
    totalTax: money(raw.total_tax),
    totalDiscounts: money(raw.discount_total),
    totalShipping: money(raw.shipping_cost),
    totalPrice: money(raw.total),
    financialStatus: mapFinancialStatus(raw.payment_status, raw.status),
    fulfillmentStatus: mapFulfillmentStatus(raw.status),
    lineItems: (raw.order_rows ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    note: raw.note ?? undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    cancelledAt: raw.status?.toLowerCase() === 'cancelled' ? raw.updated_at : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → MyCashflow order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: order.email,
    phone: order.phone,
    currency: order.currency,
    note: order.note,
    customer_id: order.customerId,
  }
  if (order.billingAddress) {
    const a = order.billingAddress
    body['billing_address'] = {
      address: a.line1,
      address2: a.line2,
      city: a.city,
      region: a.region,
      postal_code: a.postalCode,
      country: a.country,
      email: order.email,
      phone: order.phone,
    }
  }
  if (order.shippingAddress) {
    const a = order.shippingAddress
    body['shipping_address'] = {
      address: a.line1,
      address2: a.line2,
      city: a.city,
      region: a.region,
      postal_code: a.postalCode,
      country: a.country,
    }
  }
  if (order.lineItems) {
    body['order_rows'] = order.lineItems.map((li) => ({
      product_id: li.productId,
      variation_id: li.variantId,
      quantity: li.quantity,
      name: li.title,
      code: li.sku,
      unit_price: li.price?.amount != null ? minorToMajor(li.price.amount, li.price.currency) : undefined,
    }))
  }
  return body
}
