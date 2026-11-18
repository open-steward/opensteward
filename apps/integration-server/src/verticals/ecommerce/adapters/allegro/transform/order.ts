/**
 * Allegro Checkout Form → canonical Order.
 *
 * Allegro's Order Management API returns checkout forms:
 *   GET /order/checkout-forms → list
 *   GET /order/checkout-forms/{checkoutFormId} → get
 *
 * Money amounts in Allegro are `{ amount: "9.99", currency: "PLN" }`.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawAllegroMoney {
  amount: string
  currency: string
}

export interface RawAllegroLineItem {
  id: string
  offer?: {
    id?: string
    name?: string
    external?: { id?: string }
  }
  quantity: number
  originalPrice?: RawAllegroMoney
  price?: RawAllegroMoney
  boughtAt?: string
  [key: string]: unknown
}

export interface RawAllegroAddress {
  street?: string
  city?: string
  postCode?: string
  countryCode?: string
  firstName?: string
  lastName?: string
  phoneNumber?: string
}

export interface RawAllegroDelivery {
  address?: RawAllegroAddress
  method?: { id?: string; name?: string }
  cost?: RawAllegroMoney
  time?: {
    from?: string
    to?: string
  }
  pickupPoint?: unknown
}

export interface RawAllegroPayment {
  id?: string
  type?: string
  provider?: string
  finishedAt?: string
  paidAmount?: RawAllegroMoney
}

export interface RawAllegroCheckoutForm {
  id: string
  buyer?: {
    id?: string
    email?: string
    login?: string
    firstName?: string
    lastName?: string
    phoneNumber?: string
    address?: RawAllegroAddress
  }
  lineItems?: RawAllegroLineItem[]
  delivery?: RawAllegroDelivery
  payment?: RawAllegroPayment
  summary?: {
    totalToPay?: RawAllegroMoney
  }
  status?: string
  fulfillment?: {
    status?: string
    shipmentSummary?: {
      lineItemsSent?: string
    }
  }
  note?: {
    text?: string
  }
  boughtAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(m: RawAllegroMoney | undefined):
  | { amount: number; currency: string }
  | undefined {
  if (!m) return undefined
  const n = parseFloat(m.amount)
  if (Number.isNaN(n)) return undefined
  return { amount: majorToMinor(n, m.currency), currency: m.currency }
}

/**
 * Allegro checkout form status → canonical fulfillment status.
 * Allegro fulfillment statuses: NEW, PROCESSING, READY_FOR_SHIPMENT,
 * SENT, PICKED_UP, CANCELLED
 */
export function mapFulfillmentStatus(
  status: string | undefined,
): OrderFulfillmentStatus | undefined {
  if (!status) return undefined
  switch (status) {
    case 'SENT':
    case 'PICKED_UP':
      return 'FULFILLED'
    case 'READY_FOR_SHIPMENT':
    case 'PROCESSING':
      return 'PARTIAL'
    case 'NEW':
      return 'UNFULFILLED'
    default:
      return undefined
  }
}

/**
 * Allegro payment → canonical financial status.
 * We derive from `status` field + payment presence.
 */
export function mapFinancialStatus(
  status: string | undefined,
): OrderFinancialStatus | undefined {
  if (!status) return undefined
  switch (status) {
    case 'BOUGHT_AND_PAID':
    case 'FILLED_IN':
      return 'PAID'
    case 'READY_FOR_PROCESSING':
      return 'PAID'
    case 'CANCELLED':
      return 'VOIDED'
    default:
      return 'PENDING'
  }
}

function mapLineItem(raw: RawAllegroLineItem, currency: string): LineItem {
  const price = toMoney(raw.price ?? raw.originalPrice)
  return {
    id: raw.id,
    productId: raw.offer?.id,
    title: raw.offer?.name ?? raw.id,
    quantity: raw.quantity,
    price: price ?? { amount: 0, currency },
    sku: raw.offer?.external?.id ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function mapAddress(raw: RawAllegroAddress | undefined) {
  if (!raw) return undefined
  return {
    line1: raw.street,
    city: raw.city,
    postalCode: raw.postCode,
    country: raw.countryCode,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawAllegroCheckoutForm): Order {
  const total = toMoney(raw.summary?.totalToPay)
  const currency = total?.currency ?? raw.summary?.totalToPay?.currency ?? 'PLN'
  const lineItems = (raw.lineItems ?? []).map((li) => mapLineItem(li, currency))

  const shippingAddress = mapAddress(raw.delivery?.address)
  const shippingCost = toMoney(raw.delivery?.cost)
  const isCancelled = raw.status === 'CANCELLED'

  // Calculate subtotal from line items
  const subtotal =
    lineItems.length > 0
      ? {
          amount: lineItems.reduce((sum, li) => sum + li.price.amount * li.quantity, 0),
          currency,
        }
      : undefined

  return {
    id: raw.id,
    orderNumber: raw.id,
    customerId: raw.buyer?.id,
    email: raw.buyer?.email,
    phone: raw.buyer?.phoneNumber,
    currency,
    totalPrice: total,
    subtotalPrice: subtotal,
    totalShipping: shippingCost,
    financialStatus: mapFinancialStatus(raw.status),
    fulfillmentStatus: mapFulfillmentStatus(raw.fulfillment?.status),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippingAddress,
    note: raw.note?.text,
    createdAt: raw.boughtAt,
    updatedAt: raw.updatedAt,
    processedAt: raw.boughtAt,
    cancelledAt: isCancelled ? raw.updatedAt : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
