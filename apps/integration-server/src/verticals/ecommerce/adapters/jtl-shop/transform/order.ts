/**
 * JTL-Shop Order (Bestellung) → canonical Order.
 *
 * JTL-Shop orders are available under `/api/v1/orders`. Key fields:
 *  - `id`, `orderNumber` — identifiers
 *  - `status` — integer status code (1=new, 2=processing, 3=shipped, 4=cancelled, 5=partial)
 *  - `paymentStatus` — string ('paid', 'pending', 'refunded', 'partial', 'voided', 'authorized')
 *  - `customer` object (id, email, phone)
 *  - `billingAddress`, `shippingAddress` — address objects
 *  - `currency` — ISO 4217 code (commonly 'EUR')
 *  - `totalPrice`, `subtotalPrice`, `totalTax`, `shippingCosts`, `totalDiscount` — decimal major units
 *  - `items` array (line items)
 *  - `note`, `created`, `modified`, `paidAt`, `cancelledAt`
 *
 * Prices are decimal major-unit (e.g. 19.99 EUR → 1999 cents minor unit).
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw JTL-Shop shapes ───────────────────────────────────────────────────────

export interface RawJtlShopAddress {
  firstName?: string | null
  lastName?: string | null
  company?: string | null
  street?: string | null
  streetNumber?: string | null
  addressSupplement?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  countryCode?: string | null
}

export interface RawJtlShopOrderItem {
  id: number | string
  articleId?: number | string | null
  variantId?: number | string | null
  name?: string
  quantity?: number
  /** Unit price — decimal gross */
  price?: number | string | null
  tax?: number | string | null
  discount?: number | string | null
  sku?: string | null
  [key: string]: unknown
}

export interface RawJtlShopOrderCustomer {
  id?: number | string | null
  email?: string | null
  phone?: string | null
  firstName?: string | null
  lastName?: string | null
}

export interface RawJtlShopOrder {
  id: number | string
  orderNumber?: string | number | null
  /** 1=new, 2=processing, 3=shipped/completed, 4=cancelled, 5=partial */
  status?: number | null
  /** 'paid' | 'pending' | 'refunded' | 'partial' | 'voided' | 'authorized' */
  paymentStatus?: string | null
  currency?: string | null
  customer?: RawJtlShopOrderCustomer | null
  billingAddress?: RawJtlShopAddress | null
  shippingAddress?: RawJtlShopAddress | null
  items?: RawJtlShopOrderItem[]
  totalPrice?: number | string | null
  subtotalPrice?: number | string | null
  totalTax?: number | string | null
  shippingCosts?: number | string | null
  totalDiscount?: number | string | null
  note?: string | null
  coupons?: Array<{ code?: string }>
  created?: string | null
  modified?: string | null
  paidAt?: string | null
  cancelledAt?: string | null
  cancelReason?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function toMinor(v: number | string | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

function mapAddress(raw: RawJtlShopAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const streetParts = [raw.street, raw.streetNumber].filter(Boolean)
  const line1 = streetParts.length > 0 ? streetParts.join(' ') : undefined
  const city = raw.city ?? undefined
  const country = raw.countryCode ?? raw.country ?? undefined
  const postalCode = raw.zip ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.addressSupplement ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

const FIN_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  paid: 'PAID',
  pending: 'PENDING',
  refunded: 'REFUNDED',
  partial: 'PARTIALLY_PAID',
  voided: 'VOIDED',
  authorized: 'AUTHORIZED',
}

function mapFulfillmentStatus(
  status: number | null | undefined,
): OrderFulfillmentStatus | undefined {
  switch (status) {
    case 1:
      return 'UNFULFILLED'
    case 2:
      return 'PARTIAL'
    case 3:
      return 'FULFILLED'
    case 4:
      return 'UNFULFILLED'
    case 5:
      return 'PARTIAL'
    default:
      return undefined
  }
}

function mapLineItem(raw: RawJtlShopOrderItem, currency: string): LineItem {
  return {
    id: String(raw.id),
    productId: raw.articleId != null ? String(raw.articleId) : undefined,
    variantId: raw.variantId != null ? String(raw.variantId) : undefined,
    title: raw.name ?? '',
    quantity: toNum(raw.quantity),
    price: { amount: toMinor(raw.price, currency), currency },
    totalDiscount:
      raw.discount != null
        ? { amount: toMinor(raw.discount, currency), currency }
        : undefined,
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawJtlShopOrder): Order {
  const currency = raw.currency ?? 'EUR'
  const money = (v: number | string | null | undefined) => ({
    amount: toMinor(v, currency),
    currency,
  })

  return {
    id: String(raw.id),
    orderNumber: raw.orderNumber != null ? String(raw.orderNumber) : undefined,
    name: raw.orderNumber != null ? `#${raw.orderNumber}` : undefined,
    customerId: raw.customer?.id != null ? String(raw.customer.id) : undefined,
    email: raw.customer?.email ?? undefined,
    phone: raw.customer?.phone ?? undefined,
    currency,
    subtotalPrice: raw.subtotalPrice != null ? money(raw.subtotalPrice) : undefined,
    totalTax: raw.totalTax != null ? money(raw.totalTax) : undefined,
    totalDiscounts: raw.totalDiscount != null ? money(raw.totalDiscount) : undefined,
    totalShipping: raw.shippingCosts != null ? money(raw.shippingCosts) : undefined,
    totalPrice: raw.totalPrice != null ? money(raw.totalPrice) : undefined,
    financialStatus: raw.paymentStatus
      ? FIN_STATUS_MAP[raw.paymentStatus] ?? undefined
      : undefined,
    fulfillmentStatus: mapFulfillmentStatus(raw.status),
    lineItems: (raw.items ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: mapAddress(raw.shippingAddress),
    discountCodes: raw.coupons?.flatMap((c) => (c.code ? [c.code] : [])),
    note: raw.note ?? undefined,
    createdAt: raw.created ?? undefined,
    updatedAt: raw.modified ?? undefined,
    processedAt: raw.paidAt ?? undefined,
    cancelledAt: raw.cancelledAt ?? undefined,
    cancelReason: raw.cancelReason ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → JTL-Shop order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const billingAddress: Record<string, unknown> | undefined = order.billingAddress
    ? {
        street: order.billingAddress.line1,
        addressSupplement: order.billingAddress.line2,
        city: order.billingAddress.city,
        state: order.billingAddress.region,
        zip: order.billingAddress.postalCode,
        countryCode: order.billingAddress.country,
      }
    : undefined

  const shippingAddress: Record<string, unknown> | undefined = order.shippingAddress
    ? {
        street: order.shippingAddress.line1,
        addressSupplement: order.shippingAddress.line2,
        city: order.shippingAddress.city,
        state: order.shippingAddress.region,
        zip: order.shippingAddress.postalCode,
        countryCode: order.shippingAddress.country,
      }
    : undefined

  return {
    currency: order.currency,
    note: order.note,
    customer:
      order.email != null || order.phone != null
        ? { email: order.email, phone: order.phone }
        : undefined,
    billingAddress,
    shippingAddress,
    items: order.lineItems?.map((li) => ({
      articleId: li.productId,
      variantId: li.variantId,
      name: li.title,
      quantity: li.quantity,
      price: li.price?.amount != null
        ? minorToMajor(li.price.amount, li.price.currency ?? order.currency ?? 'EUR')
        : undefined,
      sku: li.sku,
    })),
  }
}
