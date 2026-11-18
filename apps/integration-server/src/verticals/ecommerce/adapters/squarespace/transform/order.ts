/**
 * Squarespace Order → canonical Order.
 *
 * Squarespace Commerce API returns orders from `GET /1.0/commerce/orders`.
 * The order model includes line items, billing/shipping addresses, and
 * fulfillment status.
 *
 * Docs: https://developers.squarespace.com/commerce-apis/retrieve-all-orders
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'

// ── Raw shapes ──────────────────────────────────────────────────────────────

export interface RawSquarespaceAddress {
  firstName?: string | null
  lastName?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  countryCode?: string | null
  postalCode?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface RawSquarespaceLineItem {
  id: string
  variantId?: string | null
  productId?: string | null
  productName?: string
  sku?: string | null
  quantity?: number
  unitPricePaid?: { value?: string; currency?: string }
  [key: string]: unknown
}

export interface RawSquarespaceOrder {
  id: string
  orderNumber?: string
  createdOn?: string
  modifiedOn?: string
  channel?: string
  customerEmail?: string | null
  fulfillmentStatus?: string
  subtotal?: { value?: string; currency?: string }
  shippingTotal?: { value?: string; currency?: string }
  discountTotal?: { value?: string; currency?: string }
  taxTotal?: { value?: string; currency?: string }
  refundedTotal?: { value?: string; currency?: string }
  grandTotal?: { value?: string; currency?: string }
  lineItems?: RawSquarespaceLineItem[]
  billingAddress?: RawSquarespaceAddress | null
  shippingAddress?: RawSquarespaceAddress | null
  fulfillments?: Array<{ shipDate?: string }>
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function centsToAmount(v: string | undefined): number {
  // Squarespace MoneyValue.value is an integer minor-unit string (cents),
  // which is exactly the canonical Money.amount representation.
  if (v == null) return 0
  const parsed = parseFloat(v)
  return Number.isNaN(parsed) ? 0 : Math.round(parsed)
}

function mapAddress(raw: RawSquarespaceAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const city = raw.city ?? undefined
  const country = raw.countryCode ?? undefined
  const postalCode = raw.postalCode ?? undefined
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

const FUL_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  PENDING: 'UNFULFILLED',
  FULFILLED: 'FULFILLED',
  CANCELED: 'RESTOCKED',
}

function mapFulfillmentStatus(s: string | undefined): OrderFulfillmentStatus | undefined {
  if (!s) return undefined
  return FUL_STATUS_MAP[s] ?? undefined
}

function mapFinancialStatus(raw: RawSquarespaceOrder): OrderFinancialStatus | undefined {
  // Squarespace doesn't have an explicit financial status field.
  // We derive it from refund state and fulfillment.
  const refunded = centsToAmount(raw.refundedTotal?.value)
  const total = centsToAmount(raw.grandTotal?.value)
  if (refunded > 0 && refunded >= total) return 'REFUNDED'
  if (refunded > 0) return 'PARTIALLY_REFUNDED'
  return 'PAID' // Squarespace orders are always paid at creation
}

function mapLineItem(raw: RawSquarespaceLineItem, currency: string): LineItem {
  return {
    id: raw.id,
    productId: raw.productId ?? undefined,
    variantId: raw.variantId ?? undefined,
    title: raw.productName ?? '',
    quantity: raw.quantity ?? 1,
    price: {
      amount: centsToAmount(raw.unitPricePaid?.value),
      currency: raw.unitPricePaid?.currency ?? currency,
    },
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformOrder(raw: RawSquarespaceOrder): Order {
  const currency =
    raw.grandTotal?.currency ??
    raw.subtotal?.currency ??
    'USD'

  const money = (obj: { value?: string; currency?: string } | undefined) => {
    if (!obj) return undefined
    return { amount: centsToAmount(obj.value), currency: obj.currency ?? currency }
  }

  return {
    id: raw.id,
    orderNumber: raw.orderNumber,
    email: raw.customerEmail ?? undefined,
    currency,
    subtotalPrice: money(raw.subtotal),
    totalTax: money(raw.taxTotal),
    totalDiscounts: money(raw.discountTotal),
    totalShipping: money(raw.shippingTotal),
    totalPrice: money(raw.grandTotal),
    financialStatus: mapFinancialStatus(raw),
    fulfillmentStatus: mapFulfillmentStatus(raw.fulfillmentStatus),
    lineItems: (raw.lineItems ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: mapAddress(raw.shippingAddress),
    createdAt: raw.createdOn,
    updatedAt: raw.modifiedOn,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Squarespace order body (for update — orders cannot be created via API). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (order.fulfillmentStatus !== undefined) {
    body.fulfillmentStatus =
      order.fulfillmentStatus === 'FULFILLED' ? 'FULFILLED' : 'PENDING'
  }
  return body
}
