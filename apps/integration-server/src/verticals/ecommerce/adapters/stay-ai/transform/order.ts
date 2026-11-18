/**
 * Stay AI Subscription → canonical Order.
 *
 * Stay AI subscriptions are the primary order-equivalent resource. Each
 * subscription contains line items, billing cadence, status, and customer
 * info. We map them onto the canonical Order schema, carrying raw fields
 * in `metadata` for platform-specific consumers.
 *
 * Docs: https://docs.stay.ai/reference/query-all-subscriptions
 */

import type { Order, LineItem, OrderFinancialStatus, OrderFulfillmentStatus } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Stay AI shapes ────────────────────────────────────────────────────────

export interface RawStayAiLineItem {
  id?: number | string | null
  productId?: number | string | null
  variantId?: number | string | null
  title?: string | null
  quantity?: number | null
  price?: number | string | null
  sku?: string | null
  [key: string]: unknown
}

export interface RawStayAiAddress {
  firstName?: string | null
  lastName?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  province?: string | null
  provinceCode?: string | null
  zip?: string | null
  country?: string | null
  countryCode?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface RawStayAiSubscription {
  id?: number | string | null
  shopifySubscriptionContractId?: number | string | null
  email?: string | null
  phone?: string | null
  customerId?: number | string | null
  status?: string | null
  /** Currency code, e.g. "USD". */
  currency?: string | null
  lineItems?: RawStayAiLineItem[] | null
  shippingAddress?: RawStayAiAddress | null
  billingAddress?: RawStayAiAddress | null
  /** Next billing timestamp (epoch ms or ISO string). */
  nextBillingDate?: number | string | null
  /** Last successful payment timestamp. */
  lastBillingDate?: number | string | null
  cancelledAt?: number | string | null
  createdAt?: number | string | null
  updatedAt?: number | string | null
  orderNotes?: string | null
  tags?: string[] | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function toMinor(v: string | number | null | undefined, currency: string): number {
  const n = toNum(v)
  return majorToMinor(n, currency)
}

/** Normalise a Stay AI timestamp to ISO-8601. Accepts epoch-ms numbers or strings. */
function toIso(v: number | string | null | undefined): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'number') {
    return new Date(v).toISOString()
  }
  const s = String(v).trim()
  if (!s) return undefined
  const parsed = Date.parse(s)
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString()
}

function mapAddress(raw: RawStayAiAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const city = raw.city ?? undefined
  const country = raw.countryCode ?? raw.country ?? undefined
  const postalCode = raw.zip ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address2 ?? undefined,
    city,
    region: raw.province ?? raw.provinceCode ?? undefined,
    postalCode,
    country,
  }
}

const STATUS_TO_FINANCIAL: Record<string, OrderFinancialStatus> = {
  ACTIVE: 'PAID',
  PAUSED: 'PENDING',
  CANCELLED: 'REFUNDED',
  FAILED: 'PARTIALLY_PAID',
}

const STATUS_TO_FULFILLMENT: Record<string, OrderFulfillmentStatus> = {
  ACTIVE: 'UNFULFILLED',
  PAUSED: 'UNFULFILLED',
  CANCELLED: 'RESTOCKED',
}

function mapLineItem(raw: RawStayAiLineItem, currency: string): LineItem {
  return {
    id: raw.id != null ? String(raw.id) : '',
    productId: raw.productId != null ? String(raw.productId) : undefined,
    variantId: raw.variantId != null ? String(raw.variantId) : undefined,
    title: raw.title ?? '',
    quantity: typeof raw.quantity === 'number' ? raw.quantity : 1,
    price: { amount: toMinor(raw.price, currency), currency },
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformSubscriptionToOrder(raw: RawStayAiSubscription): Order {
  const currency = raw.currency ?? 'USD'
  const status = (raw.status ?? '').toUpperCase()

  return {
    id: String(raw.id ?? raw.shopifySubscriptionContractId ?? ''),
    orderNumber: raw.shopifySubscriptionContractId != null
      ? String(raw.shopifySubscriptionContractId)
      : undefined,
    customerId: raw.customerId != null ? String(raw.customerId) : undefined,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    currency,
    financialStatus: STATUS_TO_FINANCIAL[status] ?? undefined,
    fulfillmentStatus: STATUS_TO_FULFILLMENT[status] ?? undefined,
    lineItems: (raw.lineItems ?? []).map((li) => mapLineItem(li, currency)),
    shippingAddress: mapAddress(raw.shippingAddress),
    billingAddress: mapAddress(raw.billingAddress),
    note: raw.orderNotes ?? undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.filter(Boolean) : undefined,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    cancelledAt: toIso(raw.cancelledAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Stay AI subscription update body (only mutable fields). */
export function untransformOrderToSubscription(order: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (order.note != null) body['orderNotes'] = order.note
  return body
}
