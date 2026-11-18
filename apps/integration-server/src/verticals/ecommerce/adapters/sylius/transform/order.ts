/**
 * Sylius Order -> canonical Order.
 *
 * Sylius orders have:
 *  - `state`: cart | new | fulfilled | cancelled
 *  - `paymentState`: cart | awaiting_payment | partially_paid | paid | cancelled | refunded | partially_refunded
 *  - `shippingState`: cart | ready | partially_shipped | shipped | cancelled
 *  - Prices in **cents** (integers)
 *
 * Admin API: `/api/v2/admin/orders`
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'

// ── Raw Sylius shapes ──────────────────────────────────────────────────────

export interface RawSyliusOrderAddress {
  firstName?: string
  lastName?: string
  street?: string
  city?: string
  provinceName?: string | null
  countryCode?: string | null
  postcode?: string | null
  phoneNumber?: string | null
  [key: string]: unknown
}

export interface RawSyliusOrderItem {
  id: number | string
  productName?: string
  variantName?: string | null
  variantCode?: string | null
  quantity?: number
  unitPrice?: number // cents
  total?: number // cents
  subtotal?: number // cents
  [key: string]: unknown
}

export interface RawSyliusOrder {
  id: number | string
  number?: string
  state?: string
  paymentState?: string | null
  shippingState?: string | null
  checkoutState?: string | null
  customer?: { id?: number | string; email?: string } | string | null
  currencyCode?: string
  itemsTotal?: number // cents
  total?: number // cents
  shippingTotal?: number // cents
  taxTotal?: number // cents
  orderPromotionTotal?: number // cents
  items?: RawSyliusOrderItem[]
  notes?: string | null
  billingAddress?: RawSyliusOrderAddress | null
  shippingAddress?: RawSyliusOrderAddress | null
  checkoutCompletedAt?: string | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function centsToDecimal(cents: number | null | undefined): number {
  // Sylius reports money in integer minor units (cents) — already canonical.
  if (cents == null) return 0
  return Math.round(cents)
}

function mapAddress(raw: RawSyliusOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street ?? undefined
  const city = raw.city ?? undefined
  const region = raw.provinceName ?? undefined
  const postalCode = raw.postcode ?? undefined
  const country = raw.countryCode ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, city, region, postalCode, country }
}

function mapFinancialStatus(
  paymentState: string | null | undefined,
): OrderFinancialStatus | undefined {
  switch (paymentState) {
    case 'awaiting_payment':
      return 'PENDING'
    case 'partially_paid':
      return 'PARTIALLY_PAID'
    case 'paid':
      return 'PAID'
    case 'partially_refunded':
      return 'PARTIALLY_REFUNDED'
    case 'refunded':
      return 'REFUNDED'
    case 'cancelled':
      return 'VOIDED'
    default:
      return undefined
  }
}

function mapFulfillmentStatus(
  shippingState: string | null | undefined,
  orderState: string | undefined,
): OrderFulfillmentStatus | undefined {
  if (orderState === 'cancelled') return 'RESTOCKED'
  switch (shippingState) {
    case 'ready':
    case 'cart':
      return 'UNFULFILLED'
    case 'partially_shipped':
      return 'PARTIAL'
    case 'shipped':
      return 'FULFILLED'
    case 'cancelled':
      return 'RESTOCKED'
    default:
      return 'UNFULFILLED'
  }
}

function mapLineItem(raw: RawSyliusOrderItem, currency: string): LineItem {
  return {
    id: String(raw.id),
    variantId: raw.variantCode ?? undefined,
    title: raw.productName ?? '',
    quantity: raw.quantity ?? 0,
    price: { amount: centsToDecimal(raw.unitPrice), currency },
    sku: raw.variantCode ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function extractCustomerId(
  customer: { id?: number | string; email?: string } | string | null | undefined,
): string | undefined {
  if (!customer) return undefined
  if (typeof customer === 'string') {
    // IRI reference like "/api/v2/admin/customers/123"
    const parts = customer.split('/')
    return parts[parts.length - 1]
  }
  return customer.id != null ? String(customer.id) : undefined
}

function extractCustomerEmail(
  customer: { id?: number | string; email?: string } | string | null | undefined,
): string | undefined {
  if (!customer || typeof customer === 'string') return undefined
  return customer.email
}

export function transformOrder(raw: RawSyliusOrder): Order {
  const currency = raw.currencyCode ?? 'USD'
  const money = (cents: number | undefined | null) =>
    cents != null ? { amount: centsToDecimal(cents), currency } : undefined

  const promoTotal = raw.orderPromotionTotal != null
    ? { amount: Math.abs(centsToDecimal(raw.orderPromotionTotal)), currency }
    : undefined

  return {
    id: String(raw.id),
    orderNumber: raw.number,
    name: raw.number != null ? `#${raw.number}` : undefined,
    customerId: extractCustomerId(raw.customer),
    email: extractCustomerEmail(raw.customer),
    currency,
    subtotalPrice: money(raw.itemsTotal),
    totalTax: money(raw.taxTotal),
    totalDiscounts: promoTotal,
    totalShipping: money(raw.shippingTotal),
    totalPrice: money(raw.total),
    financialStatus: mapFinancialStatus(raw.paymentState),
    fulfillmentStatus: mapFulfillmentStatus(raw.shippingState, raw.state),
    lineItems: (raw.items ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: mapAddress(raw.shippingAddress),
    note: raw.notes ?? undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    processedAt: raw.checkoutCompletedAt ?? undefined,
    cancelledAt: raw.state === 'cancelled' ? raw.updatedAt : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
