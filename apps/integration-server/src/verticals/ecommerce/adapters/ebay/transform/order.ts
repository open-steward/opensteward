/**
 * eBay Fulfillment API Order → canonical Order.
 *
 * eBay's Sell Fulfillment API returns orders with line items, pricing,
 * and fulfillment status:
 *   GET /sell/fulfillment/v1/order → list
 *   GET /sell/fulfillment/v1/order/{orderId} → get
 *
 * Money amounts in eBay are `{value: "9.99", currency: "USD"}` — string
 * values. We parse them to float for canonical Money.amount.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawEbayMoney {
  value: string
  currency: string
}

export interface RawEbayLineItem {
  lineItemId: string
  legacyItemId?: string
  title?: string
  sku?: string
  quantity: number
  lineItemCost?: RawEbayMoney
  deliveryCost?: {
    shippingCost?: RawEbayMoney
  }
  discountedLineItemCost?: RawEbayMoney
  total?: RawEbayMoney
  lineItemFulfillmentStatus?: string
  [key: string]: unknown
}

export interface RawEbayAddress {
  addressLine1?: string
  addressLine2?: string
  city?: string
  stateOrProvince?: string
  postalCode?: string
  country?: string
}

export interface RawEbayOrder {
  orderId: string
  legacyOrderId?: string
  creationDate?: string
  lastModifiedDate?: string
  orderFulfillmentStatus?: string
  orderPaymentStatus?: string
  pricingSummary?: {
    priceSubtotal?: RawEbayMoney
    deliveryCost?: RawEbayMoney
    tax?: RawEbayMoney
    total?: RawEbayMoney
    priceDiscount?: RawEbayMoney
  }
  buyer?: {
    username?: string
    taxAddress?: RawEbayAddress
  }
  fulfillmentStartInstructions?: Array<{
    shippingStep?: {
      shipTo?: {
        fullName?: string
        contactAddress?: RawEbayAddress
        primaryPhone?: { phoneNumber?: string }
        email?: string
      }
    }
  }>
  lineItems?: RawEbayLineItem[]
  salesRecordReference?: string
  cancelStatus?: {
    cancelState?: string
    cancelledDate?: string
  }
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(m: RawEbayMoney | undefined):
  | { amount: number; currency: string }
  | undefined {
  if (!m) return undefined
  const n = parseFloat(m.value)
  if (Number.isNaN(n)) return undefined
  return { amount: majorToMinor(n, m.currency), currency: m.currency }
}

/**
 * eBay orderFulfillmentStatus → canonical fulfillment status.
 * Values: NOT_STARTED, IN_PROGRESS, FULFILLED
 */
export function mapFulfillmentStatus(
  status: string | undefined,
): OrderFulfillmentStatus | undefined {
  if (!status) return undefined
  switch (status) {
    case 'FULFILLED':
      return 'FULFILLED'
    case 'IN_PROGRESS':
      return 'PARTIAL'
    case 'NOT_STARTED':
      return 'UNFULFILLED'
    default:
      return undefined
  }
}

/**
 * eBay orderPaymentStatus → canonical financial status.
 * Values: PAID, PARTIALLY_REFUNDED, FULLY_REFUNDED, PENDING, FAILED
 */
export function mapFinancialStatus(
  status: string | undefined,
): OrderFinancialStatus | undefined {
  if (!status) return undefined
  switch (status) {
    case 'PAID':
      return 'PAID'
    case 'PARTIALLY_REFUNDED':
      return 'PARTIALLY_REFUNDED'
    case 'FULLY_REFUNDED':
      return 'REFUNDED'
    case 'PENDING':
      return 'PENDING'
    case 'FAILED':
      return 'VOIDED'
    default:
      return undefined
  }
}

function mapLineItem(raw: RawEbayLineItem, currency: string): LineItem {
  const lineItemCost = toMoney(raw.lineItemCost)
  // eBay lineItemCost is the total (price * quantity); derive unit price.
  const qty = raw.quantity || 1
  const unit: { amount: number; currency: string } = lineItemCost
    ? { amount: Math.round(lineItemCost.amount / qty), currency: lineItemCost.currency }
    : { amount: 0, currency }

  return {
    id: raw.lineItemId,
    title: raw.title ?? raw.sku ?? raw.lineItemId,
    quantity: qty,
    price: unit,
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function mapAddress(raw: RawEbayAddress | undefined) {
  if (!raw) return undefined
  return {
    line1: raw.addressLine1,
    line2: raw.addressLine2,
    city: raw.city,
    region: raw.stateOrProvince,
    postalCode: raw.postalCode,
    country: raw.country,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawEbayOrder): Order {
  const total = toMoney(raw.pricingSummary?.total)
  const currency = total?.currency ?? raw.pricingSummary?.total?.currency ?? 'USD'
  const lineItems = (raw.lineItems ?? []).map((li) => mapLineItem(li, currency))

  const shipTo = raw.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo
  const shippingAddress = mapAddress(shipTo?.contactAddress)

  const isCancelled = raw.cancelStatus?.cancelState === 'CANCELED'

  return {
    id: raw.orderId,
    orderNumber: raw.legacyOrderId ?? raw.orderId,
    name: raw.salesRecordReference ?? raw.orderId,
    currency,
    totalPrice: total,
    subtotalPrice: toMoney(raw.pricingSummary?.priceSubtotal),
    totalTax: toMoney(raw.pricingSummary?.tax),
    totalShipping: toMoney(raw.pricingSummary?.deliveryCost),
    totalDiscounts: toMoney(raw.pricingSummary?.priceDiscount),
    financialStatus: mapFinancialStatus(raw.orderPaymentStatus),
    fulfillmentStatus: mapFulfillmentStatus(raw.orderFulfillmentStatus),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippingAddress,
    createdAt: raw.creationDate,
    updatedAt: raw.lastModifiedDate,
    processedAt: raw.creationDate,
    cancelledAt: isCancelled ? raw.cancelStatus?.cancelledDate : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
