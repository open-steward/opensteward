/**
 * Bol.com Order → canonical Order.
 *
 * Bol.com's Retailer API returns orders with order items, pricing,
 * and shipment details. Orders are buyer-initiated (sellers cannot
 * create or cancel orders via the API).
 *
 * Money amounts are plain numbers in EUR.
 *
 * Docs: https://api.bol.com/retailer/public/Retailers-Orders.html
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawBolOrderItem {
  orderItemId: string
  offerId?: string
  offerReference?: string
  ean?: string
  title?: string
  quantity: number
  quantityShipped?: number
  quantityCancelled?: number
  unitPrice?: number
  commission?: number
  fulfilmentMethod?: string
  fulfilmentStatus?: string
  cancellationRequest?: boolean
  [key: string]: unknown
}

export interface RawBolAddress {
  salutation?: string
  firstName?: string
  surname?: string
  streetName?: string
  houseNumber?: string
  houseNumberExtension?: string
  zipCode?: string
  city?: string
  countryCode?: string
  email?: string
  company?: string
}

export interface RawBolOrder {
  orderId: string
  orderPlacedDateTime?: string
  orderItems?: RawBolOrderItem[]
  shipmentDetails?: {
    salutation?: string
    firstName?: string
    surname?: string
    streetName?: string
    houseNumber?: string
    houseNumberExtension?: string
    zipCode?: string
    city?: string
    countryCode?: string
    email?: string
    company?: string
  }
  billingDetails?: RawBolAddress
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapFulfillmentStatus(items: RawBolOrderItem[] | undefined): OrderFulfillmentStatus | undefined {
  if (!items || items.length === 0) return undefined
  const allShipped = items.every(
    (i) => (i.quantityShipped ?? 0) >= i.quantity,
  )
  const someShipped = items.some((i) => (i.quantityShipped ?? 0) > 0)
  if (allShipped) return 'FULFILLED'
  if (someShipped) return 'PARTIAL'
  return 'UNFULFILLED'
}

function mapFinancialStatus(items: RawBolOrderItem[] | undefined): OrderFinancialStatus | undefined {
  if (!items || items.length === 0) return undefined
  // Bol.com orders are prepaid by the buyer — always PAID.
  return 'PAID'
}

function mapLineItem(raw: RawBolOrderItem): LineItem {
  const price = raw.unitPrice ?? 0
  return {
    id: raw.orderItemId,
    title: raw.title ?? raw.ean ?? raw.orderItemId,
    quantity: raw.quantity,
    price: { amount: majorToMinor(price, 'EUR'), currency: 'EUR' },
    sku: raw.offerReference ?? raw.ean ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function mapAddress(raw: RawBolAddress | RawBolOrder['shipmentDetails'] | undefined) {
  if (!raw) return undefined
  const line1 = [raw.streetName, raw.houseNumber, raw.houseNumberExtension]
    .filter(Boolean)
    .join(' ')
  return {
    line1: line1 || undefined,
    city: raw.city,
    postalCode: raw.zipCode,
    country: raw.countryCode,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawBolOrder): Order {
  const lineItems = (raw.orderItems ?? []).map(mapLineItem)
  const totalAmount = lineItems.reduce(
    (sum, li) => sum + li.price.amount * li.quantity,
    0,
  )

  return {
    id: raw.orderId,
    orderNumber: raw.orderId,
    currency: 'EUR',
    totalPrice: { amount: totalAmount, currency: 'EUR' },
    financialStatus: mapFinancialStatus(raw.orderItems),
    fulfillmentStatus: mapFulfillmentStatus(raw.orderItems),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippingAddress: mapAddress(raw.shipmentDetails),
    billingAddress: mapAddress(raw.billingDetails),
    email: raw.shipmentDetails?.email,
    createdAt: raw.orderPlacedDateTime,
    processedAt: raw.orderPlacedDateTime,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
