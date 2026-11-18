/**
 * X-Cart Order → canonical Order.
 *
 * X-Cart uses separate `status`, `payment_status`, and `shipping_status`
 * fields. We map them to the canonical `financialStatus` /
 * `fulfillmentStatus` pair as follows:
 *
 * payment_status  → financialStatus
 *   Paid          → PAID
 *   Awaiting      → PENDING
 *   Declined      → VOIDED
 *   Refunded      → REFUNDED
 *   (other)       → PENDING
 *
 * shipping_status → fulfillmentStatus
 *   Shipped       → FULFILLED
 *   Delivered     → FULFILLED
 *   Processing    → UNFULFILLED
 *   New           → UNFULFILLED
 *   (other)       → UNFULFILLED
 *
 * Line items live under `items[]`. Addresses follow a flat `{ name, street,
 * city, state, zip, country }` shape. Timestamps are UNIX epoch integers.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw X-Cart shapes ────────────────────────────────────────────────────────

export interface XCartAddress {
  firstname?: string | null
  lastname?: string | null
  street?: string | null
  city?: string | null
  state?: string | null
  zipcode?: string | null
  country?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface XCartOrderItem {
  item_id?: number | string
  product_id?: number | string
  name: string
  qty: number
  price: number
  sku?: string | null
  [key: string]: unknown
}

export interface XCartOrder {
  order_id: number | string
  order_number?: string | null
  date?: number | null
  status?: string | null
  payment_status?: string | null
  shipping_status?: string | null
  total: number
  currency?: string | null
  customer?: {
    profile_id?: number | string
    email?: string | null
    firstname?: string | null
    lastname?: string | null
  } | null
  items?: XCartOrderItem[]
  shipping_tracking_number?: string | null
  shipping_method?: string | null
  shipping_address?: XCartAddress | null
  billing_address?: XCartAddress | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapFinancialStatus(
  paymentStatus: string | null | undefined,
): OrderFinancialStatus | undefined {
  if (!paymentStatus) return undefined
  switch (paymentStatus.toLowerCase()) {
    case 'paid':
      return 'PAID'
    case 'awaiting':
    case 'authorized':
      return 'PENDING'
    case 'declined':
    case 'voided':
      return 'VOIDED'
    case 'refunded':
      return 'REFUNDED'
    case 'partially refunded':
    case 'partial':
      return 'PARTIALLY_REFUNDED'
    default:
      return 'PENDING'
  }
}

function mapFulfillmentStatus(
  shippingStatus: string | null | undefined,
): OrderFulfillmentStatus | undefined {
  if (!shippingStatus) return undefined
  switch (shippingStatus.toLowerCase()) {
    case 'shipped':
    case 'delivered':
      return 'FULFILLED'
    case 'partially shipped':
      return 'PARTIAL'
    case 'processing':
    case 'new':
    case 'not shipped':
      return 'UNFULFILLED'
    default:
      return 'UNFULFILLED'
  }
}

function mapAddress(raw: XCartAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.zipcode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, city, region, postalCode, country }
}

function mapLineItem(raw: XCartOrderItem, currency: string): LineItem {
  return {
    id: raw.item_id != null ? String(raw.item_id) : `${raw.product_id ?? 'unknown'}`,
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    title: raw.name,
    quantity: raw.qty,
    price: { amount: majorToMinor(raw.price, currency), currency },
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: XCartOrder): Order {
  const currency = raw.currency ?? 'USD'
  const createdAt =
    raw.date != null
      ? new Date(raw.date * 1000).toISOString()
      : undefined

  return {
    id: String(raw.order_id),
    orderNumber: raw.order_number ?? undefined,
    name: raw.order_number ? `#${raw.order_number}` : `#${raw.order_id}`,
    customerId:
      raw.customer?.profile_id != null ? String(raw.customer.profile_id) : undefined,
    email: raw.customer?.email ?? undefined,
    currency,
    totalPrice: { amount: majorToMinor(raw.total, currency), currency },
    financialStatus: mapFinancialStatus(raw.payment_status),
    fulfillmentStatus: mapFulfillmentStatus(raw.shipping_status),
    lineItems: (raw.items ?? []).map((item) => mapLineItem(item, currency)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    createdAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
