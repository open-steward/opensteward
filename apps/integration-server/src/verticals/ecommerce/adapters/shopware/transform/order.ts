/**
 * Shopware 6 Order → canonical Order.
 *
 * Shopware orders have a complex state machine. Key fields:
 *
 *  - `stateMachineState.technicalName` — order state:
 *    open, in_progress, completed, cancelled
 *  - `transactions[].stateMachineState.technicalName` — payment state:
 *    open, paid, refunded, cancelled, reminded, ...
 *  - `deliveries[].stateMachineState.technicalName` — delivery state:
 *    open, shipped, shipped_partially, returned, cancelled
 *
 * We map these to the canonical financial/fulfillment status pair.
 *
 * Line items are under `lineItems[]`. Addresses are on
 * `orderCustomer`, `billingAddress`, and `deliveries[0].shippingOrderAddress`.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Shopware shapes ────────────────────────────────────────────────────

export interface RawShopwareOrderAddress {
  id?: string
  firstName?: string
  lastName?: string
  street?: string
  additionalAddressLine1?: string | null
  zipcode?: string
  city?: string
  country?: { iso?: string; name?: string } | null
  countryState?: { shortCode?: string; name?: string } | null
  phoneNumber?: string | null
  [key: string]: unknown
}

export interface RawShopwareStateMachineState {
  technicalName?: string
  name?: string
  [key: string]: unknown
}

export interface RawShopwareOrderLineItem {
  id: string
  productId?: string | null
  referencedId?: string | null
  label?: string
  quantity?: number
  unitPrice?: number
  totalPrice?: number
  type?: string
  payload?: Record<string, unknown>
  [key: string]: unknown
}

export interface RawShopwareOrderTransaction {
  id: string
  amount?: { totalPrice?: number }
  stateMachineState?: RawShopwareStateMachineState
  paymentMethod?: { name?: string; id?: string }
  [key: string]: unknown
}

export interface RawShopwareOrderDelivery {
  id: string
  trackingCodes?: string[]
  shippingOrderAddress?: RawShopwareOrderAddress | null
  stateMachineState?: RawShopwareStateMachineState
  shippingMethod?: { name?: string }
  shippingDateEarliest?: string | null
  shippingDateLatest?: string | null
  [key: string]: unknown
}

export interface RawShopwareOrder {
  id: string
  orderNumber?: string
  orderCustomer?: {
    customerId?: string
    email?: string
    firstName?: string
    lastName?: string
  }
  currencyFactor?: number
  currency?: { isoCode?: string; shortName?: string }
  amountTotal?: number
  amountNet?: number
  shippingTotal?: number
  positionPrice?: number
  taxStatus?: string
  stateMachineState?: RawShopwareStateMachineState
  lineItems?: RawShopwareOrderLineItem[]
  transactions?: RawShopwareOrderTransaction[]
  deliveries?: RawShopwareOrderDelivery[]
  billingAddress?: RawShopwareOrderAddress | null
  customerComment?: string | null
  orderDate?: string
  createdAt?: string
  updatedAt?: string | null
  [key: string]: unknown
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mapAddress(raw: RawShopwareOrderAddress | undefined | null): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street
  const line2 = raw.additionalAddressLine1 ?? undefined
  const city = raw.city
  const region = raw.countryState?.name ?? raw.countryState?.shortCode
  const postalCode = raw.zipcode
  const country = raw.country?.iso ?? raw.country?.name
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapFinancialStatus(
  transactions: RawShopwareOrderTransaction[] | undefined,
  orderState: string | undefined,
): OrderFinancialStatus | undefined {
  // Primary: look at first transaction payment state
  const paymentState = transactions?.[0]?.stateMachineState?.technicalName
  if (paymentState) {
    switch (paymentState) {
      case 'open':
      case 'reminded':
        return 'PENDING'
      case 'authorized':
        return 'AUTHORIZED'
      case 'paid':
      case 'paid_partially':
        return paymentState === 'paid_partially' ? 'PARTIALLY_PAID' : 'PAID'
      case 'refunded':
      case 'refunded_partially':
        return paymentState === 'refunded_partially' ? 'PARTIALLY_REFUNDED' : 'REFUNDED'
      case 'cancelled':
      case 'failed':
        return 'VOIDED'
      default:
        break
    }
  }
  // Fallback: order-level state
  if (orderState === 'cancelled') return 'VOIDED'
  if (orderState === 'completed') return 'PAID'
  return 'PENDING'
}

function mapFulfillmentStatus(
  deliveries: RawShopwareOrderDelivery[] | undefined,
): OrderFulfillmentStatus | undefined {
  const deliveryState = deliveries?.[0]?.stateMachineState?.technicalName
  if (!deliveryState) return 'UNFULFILLED'
  switch (deliveryState) {
    case 'open':
      return 'UNFULFILLED'
    case 'shipped':
      return 'FULFILLED'
    case 'shipped_partially':
      return 'PARTIAL'
    case 'returned':
    case 'returned_partially':
      return 'RESTOCKED'
    case 'cancelled':
      return 'UNFULFILLED'
    default:
      return 'UNFULFILLED'
  }
}

function mapLineItem(raw: RawShopwareOrderLineItem, currency: string): LineItem {
  return {
    id: raw.id,
    productId: raw.productId ?? raw.referencedId ?? undefined,
    title: raw.label ?? '',
    quantity: raw.quantity ?? 0,
    price: { amount: majorToMinor(raw.unitPrice ?? 0, currency), currency },
    sku: (raw.payload?.['productNumber'] as string) ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ──────────────────────────────────────────────────────────────

export function transformOrder(raw: RawShopwareOrder): Order {
  const currency = raw.currency?.isoCode ?? raw.currency?.shortName ?? 'EUR'
  const money = (v: number | undefined | null) =>
    v != null ? { amount: majorToMinor(v, currency), currency } : undefined

  const financialStatus = mapFinancialStatus(
    raw.transactions,
    raw.stateMachineState?.technicalName,
  )
  const fulfillmentStatus = mapFulfillmentStatus(raw.deliveries)

  const productLineItems = (raw.lineItems ?? []).filter(
    (li) => li.type === 'product' || !li.type,
  )

  const firstDelivery = raw.deliveries?.[0]
  const shippingAddress = mapAddress(firstDelivery?.shippingOrderAddress)
  const billingAddress = mapAddress(raw.billingAddress)

  return {
    id: raw.id,
    orderNumber: raw.orderNumber,
    name: raw.orderNumber ? `#${raw.orderNumber}` : undefined,
    customerId: raw.orderCustomer?.customerId ?? undefined,
    email: raw.orderCustomer?.email,
    currency,
    subtotalPrice: money(raw.positionPrice),
    totalShipping: money(raw.shippingTotal),
    totalPrice: money(raw.amountTotal),
    financialStatus,
    fulfillmentStatus,
    lineItems: productLineItems.map((li) => mapLineItem(li, currency)),
    billingAddress,
    shippingAddress,
    note: raw.customerComment ?? undefined,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    cancelledAt:
      raw.stateMachineState?.technicalName === 'cancelled'
        ? (raw.updatedAt ?? undefined)
        : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformOrder(
  order: Partial<Order>,
): Record<string, unknown> {
  return {
    orderNumber: order.orderNumber,
    customerComment: order.note,
  }
}
