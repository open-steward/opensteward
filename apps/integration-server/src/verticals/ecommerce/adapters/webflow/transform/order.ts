/**
 * Webflow Order → canonical Order.
 *
 * Webflow orders are retrieved via `/sites/{siteId}/orders`. Orders in
 * Webflow are fairly read-heavy — creation is done by the storefront, not
 * the API. Limited update support (status, fulfillment).
 *
 * Docs: https://developers.webflow.com/data/reference/ecommerce/orders
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'

// ── Raw shapes ──────────────────────────────────────────────────────────────

export interface RawWebflowAddress {
  type?: string
  addressee?: string
  line1?: string
  line2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  [key: string]: unknown
}

export interface RawWebflowOrderItem {
  productId?: string
  productName?: string
  variantId?: string
  variantName?: string
  variantSku?: string
  variantPrice?: { value?: number; unit?: string }
  count?: number
  rowTotal?: { value?: number; unit?: string }
  [key: string]: unknown
}

export interface RawWebflowOrder {
  orderId: string
  orderNumber?: string
  status?: string
  comment?: string
  customerPaid?: { value?: number; unit?: string }
  netAmount?: { value?: number; unit?: string }
  totalTax?: { value?: number; unit?: string }
  shippingTotal?: { value?: number; unit?: string }
  disputedAt?: string | null
  customerInfo?: {
    fullName?: string
    email?: string
  }
  billingAddress?: RawWebflowAddress | null
  shippingAddress?: RawWebflowAddress | null
  purchasedItems?: RawWebflowOrderItem[]
  stripeDetails?: { refundReason?: string; refundId?: string } | null
  paymentProcessor?: string
  acceptedOn?: string
  fulfilledOn?: string | null
  refundedOn?: string | null
  createdOn?: string
  lastUpdated?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function centsToAmount(cents: number | undefined): number {
  // Webflow reports money in integer minor units (cents) already.
  if (cents == null) return 0
  return Math.round(cents)
}

function mapAddress(raw: RawWebflowAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.line1 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zip ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.line2 ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

function mapFinancialStatus(status: string | undefined): OrderFinancialStatus | undefined {
  if (!status) return undefined
  const s = status.toLowerCase()
  if (s === 'pending') return 'PENDING'
  if (s === 'paid' || s === 'fulfilled' || s === 'unfulfilled') return 'PAID'
  if (s === 'refunded') return 'REFUNDED'
  if (s === 'disputed') return 'VOIDED'
  return 'PENDING'
}

function mapFulfillmentStatus(status: string | undefined): OrderFulfillmentStatus | undefined {
  if (!status) return undefined
  const s = status.toLowerCase()
  if (s === 'fulfilled') return 'FULFILLED'
  if (s === 'unfulfilled' || s === 'pending') return 'UNFULFILLED'
  if (s === 'refunded') return 'RESTOCKED'
  return 'UNFULFILLED'
}

function mapLineItem(raw: RawWebflowOrderItem, currency: string, index: number): LineItem {
  return {
    id: raw.variantId ?? `item-${index}`,
    productId: raw.productId,
    variantId: raw.variantId,
    title: raw.productName ?? raw.variantName ?? '',
    quantity: raw.count ?? 1,
    price: {
      amount: centsToAmount(raw.variantPrice?.value),
      currency,
    },
    sku: raw.variantSku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformOrder(raw: RawWebflowOrder): Order {
  const currency = raw.customerPaid?.unit ?? 'USD'
  const money = (v: number | undefined) =>
    v != null ? { amount: centsToAmount(v), currency } : undefined

  return {
    id: raw.orderId,
    orderNumber: raw.orderNumber,
    email: raw.customerInfo?.email,
    name: raw.customerInfo?.fullName,
    currency,
    subtotalPrice: money(raw.netAmount?.value),
    totalTax: money(raw.totalTax?.value),
    totalShipping: money(raw.shippingTotal?.value),
    totalPrice: money(raw.customerPaid?.value),
    financialStatus: mapFinancialStatus(raw.status),
    fulfillmentStatus: mapFulfillmentStatus(raw.status),
    lineItems: (raw.purchasedItems ?? []).map((li, i) => mapLineItem(li, currency, i)),
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: mapAddress(raw.shippingAddress),
    note: raw.comment ?? undefined,
    createdAt: raw.createdOn,
    updatedAt: raw.lastUpdated,
    processedAt: raw.acceptedOn,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Webflow order body (for update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    comment: order.note,
  }
}
