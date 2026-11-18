/**
 * ikas Order → canonical Order.
 *
 * ikas order API fields (from listOrder GraphQL query):
 *   id, orderNumber, customer { id, email, phone }, currencyCode,
 *   totalFinalPrice, totalPrice, totalTax, totalDiscount, shippingCost,
 *   orderPaymentStatus, status (fulfillment), orderLineItems, orderPackages,
 *   billingAddress, shippingAddress, cancelReason, orderedAt, updatedAt, createdAt
 *
 * Payment statuses: WAITING, PAID, PARTIALLY_PAID, REFUNDED, CANCELLED, FAILED
 * Order (fulfillment) statuses: CREATED, PREPARING, READY, SHIPPED, DELIVERED, CANCELLED, RETURNED
 *
 * Docs: https://ikas.dev/docs/api/admin-api/orders
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw ikas shapes ───────────────────────────────────────────────────────────

export interface RawIkasOrderAddress {
  addressLine1?: string | null
  addressLine2?: string | null
  city?: { name?: string } | null
  state?: { name?: string } | null
  country?: { name?: string; code?: string; iso2?: string } | null
  postalCode?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  company?: string | null
  [key: string]: unknown
}

export interface RawIkasOrderLineItem {
  id: string
  productId?: string | null
  variantId?: string | null
  productName?: string | null
  quantity?: number | null
  finalPrice?: number | null
  price?: number | null
  discount?: number | null
  sku?: string | null
  [key: string]: unknown
}

export interface RawIkasOrderPackage {
  id: string
  status?: string | null
  [key: string]: unknown
}

export interface RawIkasOrderCustomer {
  id?: string | null
  email?: string | null
  phone?: string | null
  firstName?: string | null
  lastName?: string | null
}

export interface RawIkasOrder {
  id: string
  orderNumber?: string | number | null
  customer?: RawIkasOrderCustomer | null
  currencyCode?: string | null
  totalFinalPrice?: number | null
  totalPrice?: number | null
  totalTax?: number | null
  totalDiscount?: number | null
  shippingCost?: number | null
  orderPaymentStatus?: string | null
  status?: string | null
  orderLineItems?: RawIkasOrderLineItem[] | null
  orderPackages?: RawIkasOrderPackage[] | null
  billingAddress?: RawIkasOrderAddress | null
  shippingAddress?: RawIkasOrderAddress | null
  cancelReason?: string | null
  orderedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(raw: RawIkasOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.addressLine1 ?? undefined
  const city = raw.city?.name ?? undefined
  const country = raw.country?.iso2 ?? raw.country?.code ?? raw.country?.name ?? undefined
  const postalCode = raw.postalCode ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.addressLine2 ?? undefined,
    city,
    region: raw.state?.name ?? undefined,
    postalCode,
    country,
  }
}

/**
 * ikas payment status → canonical financial status.
 * ikas: WAITING, PAID, PARTIALLY_PAID, REFUNDED, CANCELLED, FAILED
 */
const FIN_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  WAITING: 'PENDING',
  PAID: 'PAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'VOIDED',
  FAILED: 'VOIDED',
}

/**
 * ikas order status → canonical fulfillment status.
 * ikas: CREATED, PREPARING, READY, SHIPPED, DELIVERED, CANCELLED, RETURNED
 */
const FUL_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  CREATED: 'UNFULFILLED',
  PREPARING: 'PARTIAL',
  READY: 'PARTIAL',
  SHIPPED: 'PARTIAL',
  DELIVERED: 'FULFILLED',
  CANCELLED: 'RESTOCKED',
  RETURNED: 'RESTOCKED',
}

function toMinor(v: number | null | undefined, currency: string): number {
  if (v == null) return 0
  return majorToMinor(v, currency)
}

function mapLineItem(raw: RawIkasOrderLineItem, currency: string): LineItem {
  return {
    id: raw.id,
    productId: raw.productId ?? undefined,
    variantId: raw.variantId ?? undefined,
    title: raw.productName ?? 'Unknown',
    quantity: raw.quantity ?? 0,
    price: {
      amount: toMinor(raw.finalPrice ?? raw.price, currency),
      currency,
    },
    totalDiscount:
      raw.discount != null && raw.discount > 0
        ? { amount: toMinor(raw.discount, currency), currency }
        : undefined,
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawIkasOrder): Order {
  const currency = raw.currencyCode ?? 'TRY'
  const money = (v: number | null | undefined) =>
    v != null ? { amount: toMinor(v, currency), currency } : undefined

  return {
    id: raw.id,
    orderNumber: raw.orderNumber != null ? String(raw.orderNumber) : undefined,
    customerId: raw.customer?.id ?? undefined,
    email: raw.customer?.email ?? undefined,
    phone: raw.customer?.phone ?? undefined,
    currency,
    subtotalPrice: money(raw.totalPrice),
    totalTax: money(raw.totalTax),
    totalDiscounts: money(raw.totalDiscount),
    totalShipping: money(raw.shippingCost),
    totalPrice: money(raw.totalFinalPrice),
    financialStatus: raw.orderPaymentStatus
      ? FIN_STATUS_MAP[raw.orderPaymentStatus] ?? undefined
      : undefined,
    fulfillmentStatus: raw.status ? FUL_STATUS_MAP[raw.status] ?? undefined : undefined,
    lineItems: (raw.orderLineItems ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: mapAddress(raw.shippingAddress),
    fulfillmentIds: raw.orderPackages?.map((p) => p.id),
    cancelReason: raw.cancelReason ?? undefined,
    processedAt: raw.orderedAt ?? undefined,
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.updatedAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → ikas order input (for createOrderWithTransactions). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    customer: order.email ? { email: order.email } : undefined,
    currencyCode: order.currency,
    orderLineItems: order.lineItems?.map((li) => ({
      productId: li.productId,
      variantId: li.variantId,
      quantity: li.quantity,
    })),
  }
}
