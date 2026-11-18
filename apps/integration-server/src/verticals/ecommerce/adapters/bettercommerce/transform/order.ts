/**
 * BetterCommerce Order → canonical Order.
 *
 * BetterCommerce orders live under `/api/v2/commerce/order`.
 *
 * Field mapping:
 *  orderId / recordId      → id
 *  orderNo                 → orderNumber / name
 *  userId / customerId     → customerId
 *  email                   → email
 *  phoneNo                 → phone
 *  currencyCode            → currency
 *  subTotal                → subtotalPrice (major → minor)
 *  taxAmount               → totalTax
 *  discount                → totalDiscounts
 *  shippingCharge          → totalShipping
 *  grandTotal / total      → totalPrice
 *  paymentStatus           → financialStatus
 *  orderStatus             → fulfillmentStatus
 *  items / lineItems       → lineItems
 *  billingAddress          → billingAddress
 *  shippingAddress         → shippingAddress
 *  promoCode               → discountCodes
 *  orderDate / createdAt   → createdAt / processedAt
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawBCOrderAddress {
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  postCode?: string | null
  country?: string | null
  countryCode?: string | null
  [key: string]: unknown
}

export interface RawBCOrderLineItem {
  lineItemId?: string
  recordId?: string
  productId?: string
  stockCode?: string
  name?: string
  qty?: number
  quantity?: number
  price?: number | string | null
  discount?: number | string | null
  sku?: string | null
  [key: string]: unknown
}

export interface RawBCOrder {
  orderId?: string
  recordId?: string
  orderNo?: string | number
  userId?: string
  customerId?: string
  email?: string | null
  phoneNo?: string | null
  currencyCode?: string
  currency?: string
  subTotal?: number | string | null
  taxAmount?: number | string | null
  discount?: number | string | null
  shippingCharge?: number | string | null
  grandTotal?: number | string | null
  total?: number | string | null
  paymentStatus?: string | null
  orderStatus?: string | null
  status?: string | null
  items?: RawBCOrderLineItem[]
  lineItems?: RawBCOrderLineItem[]
  billingAddress?: RawBCOrderAddress | null
  shippingAddress?: RawBCOrderAddress | null
  promoCode?: string | null
  notes?: string | null
  orderDate?: string | null
  createdAt?: string
  updatedAt?: string
  cancelledAt?: string | null
  cancelReason?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function toMinor(v: number | string | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

function mapAddress(raw: RawBCOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const city = raw.city ?? undefined
  const country = raw.countryCode ?? raw.country ?? undefined
  const postalCode = raw.postCode ?? undefined
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

const FIN_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  pending: 'PENDING',
  authorized: 'AUTHORIZED',
  paid: 'PAID',
  partially_paid: 'PARTIALLY_PAID',
  partially_refunded: 'PARTIALLY_REFUNDED',
  refunded: 'REFUNDED',
  voided: 'VOIDED',
  // BetterCommerce-specific payment status strings
  unpaid: 'PENDING',
  'partially paid': 'PARTIALLY_PAID',
}

const FUL_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  unfulfilled: 'UNFULFILLED',
  pending: 'UNFULFILLED',
  processing: 'UNFULFILLED',
  partial: 'PARTIAL',
  'partially shipped': 'PARTIAL',
  fulfilled: 'FULFILLED',
  shipped: 'FULFILLED',
  delivered: 'FULFILLED',
  cancelled: 'RESTOCKED',
  returned: 'RESTOCKED',
}

function mapLineItem(raw: RawBCOrderLineItem, currency: string): LineItem {
  const id = raw.lineItemId ?? raw.recordId ?? ''
  return {
    id,
    productId: raw.productId ?? undefined,
    title: raw.name ?? '',
    quantity: raw.qty ?? raw.quantity ?? 1,
    price: { amount: toMinor(raw.price, currency), currency },
    totalDiscount:
      raw.discount != null
        ? { amount: toMinor(raw.discount, currency), currency }
        : undefined,
    sku: raw.sku ?? raw.stockCode ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawBCOrder): Order {
  const currency = raw.currencyCode ?? raw.currency ?? 'GBP'
  const money = (v: number | string | null | undefined) => ({
    amount: toMinor(v, currency),
    currency,
  })

  const rawItems = raw.items ?? raw.lineItems ?? []
  const orderNumber = raw.orderNo != null ? String(raw.orderNo) : undefined

  const financialKey = (raw.paymentStatus ?? '').toLowerCase()
  const fulfillmentKey = (raw.orderStatus ?? raw.status ?? '').toLowerCase()

  return {
    id: raw.orderId ?? raw.recordId ?? '',
    orderNumber,
    name: orderNumber,
    customerId: raw.userId ?? raw.customerId ?? undefined,
    email: raw.email ?? undefined,
    phone: raw.phoneNo ?? undefined,
    currency,
    subtotalPrice: raw.subTotal != null ? money(raw.subTotal) : undefined,
    totalTax: raw.taxAmount != null ? money(raw.taxAmount) : undefined,
    totalDiscounts: raw.discount != null ? money(raw.discount) : undefined,
    totalShipping: raw.shippingCharge != null ? money(raw.shippingCharge) : undefined,
    totalPrice:
      raw.grandTotal != null
        ? money(raw.grandTotal)
        : raw.total != null
          ? money(raw.total)
          : undefined,
    financialStatus: FIN_STATUS_MAP[financialKey] ?? undefined,
    fulfillmentStatus: FUL_STATUS_MAP[fulfillmentKey] ?? undefined,
    lineItems: rawItems.map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: mapAddress(raw.shippingAddress),
    discountCodes: raw.promoCode ? [raw.promoCode] : undefined,
    note: raw.notes ?? undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    processedAt: raw.orderDate ?? raw.createdAt,
    cancelledAt: raw.cancelledAt ?? undefined,
    cancelReason: raw.cancelReason ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → BetterCommerce order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    email: order.email,
    phoneNo: order.phone,
    currencyCode: order.currency,
    notes: order.note,
    items: order.lineItems?.map((li) => ({
      stockCode: li.sku,
      productId: li.productId,
      name: li.title,
      qty: li.quantity,
      // li.price.amount is integer minor units; BC expects major-unit decimal.
      price: minorToMajor(li.price?.amount, li.price?.currency),
    })),
    shippingAddress: order.shippingAddress
      ? {
          address1: order.shippingAddress.line1,
          address2: order.shippingAddress.line2,
          city: order.shippingAddress.city,
          state: order.shippingAddress.region,
          postCode: order.shippingAddress.postalCode,
          countryCode: order.shippingAddress.country,
        }
      : undefined,
  }
}
