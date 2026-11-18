/**
 * VTEX Order → canonical Order.
 *
 * VTEX order statuses are granular workflow states. We map them to the
 * canonical financial + fulfillment status pair:
 *
 *   order-created / order-accepted / payment-pending / window-to-change-payment
 *     → { PENDING, UNFULFILLED }
 *   payment-approved / window-to-cancel / ready-for-handling / start-handling /
 *   ready-for-invoicing / invoice / authorize-fulfillment / waiting-*
 *     → { PAID, UNFULFILLED }
 *   waiting-for-fulfillment / handling
 *     → { PAID, PARTIAL }
 *   invoiced / on-order-completed / on-order-completed-ffm
 *     → { PAID, FULFILLED }
 *   cancellation-requested / request-cancel / cancel / canceled
 *     → { VOIDED, UNFULFILLED }
 *
 * VTEX money values are already in integer minor units (centavos/cents) and
 * map directly to the canonical Money.amount — no conversion needed.
 *
 * Docs: https://developers.vtex.com/vtex-rest-api/reference/listorders
 *       https://help.vtex.com/docs/tutorials/order-flow-and-status
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw VTEX shapes ──────────────────────────────────────────────────────────

export interface RawVtexClientProfileData {
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  document?: string | null
  isCorporate?: boolean
  corporateName?: string | null
}

export interface RawVtexAddress {
  addressType?: string | null
  receiverName?: string | null
  addressId?: string | null
  street?: string | null
  number?: string | null
  complement?: string | null
  neighborhood?: string | null
  postalCode?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
}

export interface RawVtexTotal {
  id: string
  name: string
  /** Value in integer minor units (centavos). */
  value: number
}

export interface RawVtexOrderItem {
  id: string
  productId?: string | null
  refId?: string | null
  ean?: string | null
  name?: string | null
  skuName?: string | null
  /** Unit selling price in integer minor units. */
  price: number
  listPrice?: number | null
  sellingPrice?: number | null
  quantity: number
  uniqueId?: string | null
  seller?: string | null
  imageUrl?: string | null
  tax?: number
  [key: string]: unknown
}

export interface RawVtexShippingData {
  address?: RawVtexAddress | null
  logisticsInfo?: Array<{
    itemIndex?: number
    selectedSla?: string | null
    deliveredDate?: string | null
    shippingEstimateDate?: string | null
  }>
}

export interface RawVtexPaymentData {
  transactions?: Array<{
    transactionId?: string | null
    payments?: Array<{
      id?: string | null
      paymentSystem?: string | null
      paymentSystemName?: string | null
      value?: number
      lastDigits?: string | null
    }>
  }>
}

/** Full order object returned by GET /api/oms/pvt/orders/{orderId} */
export interface RawVtexOrder {
  orderId: string
  sequence?: string | null
  marketplaceOrderId?: string | null
  status: string
  statusDescription?: string | null
  /** Total order value in integer minor units (centavos). */
  value: number
  creationDate: string
  lastChange?: string | null
  currencyCode?: string | null
  clientProfileData?: RawVtexClientProfileData | null
  shippingData?: RawVtexShippingData | null
  invoiceData?: { address?: RawVtexAddress | null } | null
  totals?: RawVtexTotal[]
  items?: RawVtexOrderItem[]
  paymentData?: RawVtexPaymentData | null
  cancelledData?: { reason?: string | null } | null
  [key: string]: unknown
}

/** Lightweight shape returned by the list endpoint GET /api/oms/pvt/orders */
export interface RawVtexOrderSummary {
  orderId: string
  sequence?: string | null
  status: string
  statusDescription?: string | null
  /** Total value in integer minor units. */
  value: number
  creationDate: string
  lastChange?: string | null
  currencyCode?: string | null
  clientName?: string | null
  totalItems?: number
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatuses(status: string | undefined): {
  financialStatus?: OrderFinancialStatus
  fulfillmentStatus?: OrderFulfillmentStatus
} {
  if (!status) return {}
  switch (status) {
    case 'order-created':
    case 'order-accepted':
    case 'payment-pending':
    case 'window-to-change-payment':
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 'payment-approved':
    case 'window-to-cancel':
    case 'ready-for-handling':
    case 'start-handling':
    case 'ready-for-invoicing':
    case 'invoice':
    case 'authorize-fulfillment':
    case 'waiting-for-authorization':
    case 'waiting-for-manual-authorization':
    case 'waiting-ffmt-authorization':
    case 'waiting-for-mkt-authorization':
    case 'window-to-change-seller':
    case 'waiting-seller-handling':
      return { financialStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED' }
    case 'waiting-for-fulfillment':
    case 'handling':
      return { financialStatus: 'PAID', fulfillmentStatus: 'PARTIAL' }
    case 'invoiced':
    case 'on-order-completed':
    case 'on-order-completed-ffm':
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 'cancellation-requested':
    case 'request-cancel':
    case 'cancel':
    case 'canceled':
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    default:
      return {}
  }
}

function mapAddress(raw: RawVtexAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  // VTEX stores the street number separately — join them.
  const streetParts = [raw.street, raw.number].filter(Boolean)
  const line1 = streetParts.length > 0 ? streetParts.join(', ') : undefined
  const line2 = raw.complement ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.postalCode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function getTotalByKey(
  totals: RawVtexTotal[] | undefined,
  id: string,
): number | undefined {
  if (!totals) return undefined
  const t = totals.find((x) => x.id === id)
  return t != null ? t.value : undefined
}

function mapLineItem(raw: RawVtexOrderItem, currency: string): LineItem {
  // VTEX sellingPrice is the per-unit promotional price (same minor-unit scale).
  const unitPrice = raw.sellingPrice ?? raw.price
  return {
    id: raw.id,
    productId: raw.productId ?? undefined,
    variantId: raw.id,
    title: raw.skuName ?? raw.name ?? raw.id,
    quantity: raw.quantity,
    price: { amount: unitPrice, currency },
    sku: raw.refId ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawVtexOrder): Order {
  const currency = raw.currencyCode ?? 'BRL'
  const { financialStatus, fulfillmentStatus } = mapStatuses(raw.status)
  const totals = raw.totals ?? []

  const shippingAddress = mapAddress(raw.shippingData?.address)
  const billingAddress = mapAddress(raw.invoiceData?.address) ?? shippingAddress

  const subtotalValue = getTotalByKey(totals, 'Items')
  const taxValue = getTotalByKey(totals, 'Tax')
  const shippingValue = getTotalByKey(totals, 'Shipping')
  const discountValue = getTotalByKey(totals, 'Discounts')

  const isCanceled = raw.status === 'canceled' || raw.status === 'cancel'

  return {
    id: raw.orderId,
    orderNumber: raw.sequence ?? undefined,
    name: raw.sequence != null ? `#${raw.sequence}` : undefined,
    email: raw.clientProfileData?.email ?? undefined,
    phone: raw.clientProfileData?.phone ?? undefined,
    currency,
    subtotalPrice:
      subtotalValue != null ? { amount: subtotalValue, currency } : undefined,
    totalTax: taxValue != null ? { amount: taxValue, currency } : undefined,
    totalShipping:
      shippingValue != null ? { amount: shippingValue, currency } : undefined,
    totalDiscounts:
      discountValue != null
        ? { amount: Math.abs(discountValue), currency }
        : undefined,
    totalPrice: { amount: raw.value, currency },
    financialStatus,
    fulfillmentStatus,
    lineItems: (raw.items ?? []).map((li) => mapLineItem(li, currency)),
    shippingAddress,
    billingAddress,
    cancelledAt: isCanceled
      ? (toIsoDatetime(raw.lastChange ?? undefined) ?? undefined)
      : undefined,
    cancelReason: raw.cancelledData?.reason ?? undefined,
    createdAt: toIsoDatetime(raw.creationDate) ?? raw.creationDate,
    updatedAt: toIsoDatetime(raw.lastChange ?? undefined) ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Minimal transform for list-endpoint summaries. */
export function transformOrderSummary(raw: RawVtexOrderSummary): Order {
  const currency = raw.currencyCode ?? 'BRL'
  const { financialStatus, fulfillmentStatus } = mapStatuses(raw.status)
  return {
    id: raw.orderId,
    orderNumber: raw.sequence ?? undefined,
    name: raw.sequence != null ? `#${raw.sequence}` : undefined,
    currency,
    totalPrice: { amount: raw.value, currency },
    financialStatus,
    fulfillmentStatus,
    createdAt: toIsoDatetime(raw.creationDate) ?? raw.creationDate,
    updatedAt: toIsoDatetime(raw.lastChange ?? undefined) ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Order → VTEX body for order creation.
 *
 * Note: VTEX order mutations are mostly handled through dedicated workflow
 * endpoints (cancel, invoice, start-handling, etc.) rather than a generic
 * PATCH. This helper is used only for cancel payloads and similar helpers
 * passed through the adapter.
 */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    orderId: order.id,
    clientProfileData:
      order.email != null ? { email: order.email, phone: order.phone } : undefined,
  }
}
