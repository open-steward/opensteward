/**
 * Wix eCommerce Order → canonical Order.
 *
 * Every field read here is named in the Order schema of Search Orders and Get
 * Order:
 *   https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/orders/search-orders.md
 *   https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/orders/get-order.md
 *
 * Money is a `Price` — "name: amount | type: string | description: Amount."
 * plus a display-only `formattedAmount` — with NO currency of its own. The
 * currency is the order's: "name: currency | type: string | description:
 * Currency used for the pricing of this order in ISO-4217 format." An amount
 * is therefore only emitted when both the amount and the order currency are
 * present; nothing is defaulted.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address, Money } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes (documented fields only) ─────────────────────────────────────

/** eCom `Price`: "amount | type: string", "formattedAmount | type: string". */
export interface RawWixPrice {
  amount?: string
  formattedAmount?: string
}

/** eCom `Address` (billingInfo.address, shippingDestination.address). */
export interface RawWixOrderAddress {
  country?: string
  subdivision?: string
  city?: string
  postalCode?: string
  addressLine?: string
  addressLine2?: string
  [key: string]: unknown
}

/** eCom `AddressWithContact`. */
export interface RawWixAddressWithContact {
  address?: RawWixOrderAddress
  contactDetails?: {
    firstName?: string
    lastName?: string
    phone?: string
    company?: string
  }
}

export interface RawWixLineItem {
  id?: string
  productName?: { original?: string; translated?: string }
  catalogReference?: {
    catalogItemId?: string
    appId?: string
    options?: Record<string, unknown>
  }
  quantity?: number
  totalDiscount?: RawWixPrice
  physicalProperties?: { weight?: number; sku?: string; shippable?: boolean }
  /** "Line item price after line item discounts for display purposes." */
  price?: RawWixPrice
  /**
   * "Line item price before line item discounts for display purposes.
   * Defaults to `price` when not provided."
   */
  priceBeforeDiscounts?: RawWixPrice
  [key: string]: unknown
}

export interface RawWixOrder {
  id?: string
  number?: number | string
  createdDate?: string
  updatedDate?: string
  lineItems?: RawWixLineItem[]
  buyerInfo?: {
    visitorId?: string
    memberId?: string
    contactId?: string
    email?: string
  }
  paymentStatus?: string
  fulfillmentStatus?: string
  currency?: string
  priceSummary?: {
    subtotal?: RawWixPrice
    shipping?: RawWixPrice
    tax?: RawWixPrice
    discount?: RawWixPrice
    total?: RawWixPrice
  }
  billingInfo?: RawWixAddressWithContact
  shippingInfo?: {
    logistics?: {
      /**
       * ONE-OF with pickupDetails. "For pickup orders, this contains the
       * pickup location address, not the recipient's address."
       */
      shippingDestination?: RawWixAddressWithContact
      /** "Pickup details for store pickup or pickup point orders." */
      pickupDetails?: { address?: RawWixOrderAddress; pickupMethod?: string }
    }
  }
  buyerNote?: string
  status?: string
  appliedDiscounts?: Array<{ coupon?: { id?: string; code?: string; name?: string } }>
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** A documented `Price` in the order's currency, or undefined when either is missing. */
export function wixPriceToMoney(
  price: RawWixPrice | undefined,
  currency: string | undefined,
): Money | undefined {
  if (!currency || price?.amount == null || price.amount === '') return undefined
  const major = Number(price.amount)
  if (!Number.isFinite(major)) return undefined
  return { amount: majorToMinor(major, currency), currency }
}

function mapAddress(raw: RawWixOrderAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const out: Address = {
    line1: raw.addressLine || undefined,
    line2: raw.addressLine2 || undefined,
    city: raw.city || undefined,
    region: raw.subdivision || undefined,
    postalCode: raw.postalCode || undefined,
    country: raw.country || undefined,
  }
  return Object.values(out).some((v) => v !== undefined) ? out : undefined
}

/**
 * `paymentStatus` enum: UNSPECIFIED, NOT_PAID, PAID, PARTIALLY_REFUNDED,
 * FULLY_REFUNDED, PENDING, PARTIALLY_PAID, PENDING_MERCHANT, CANCELED,
 * DECLINED. Values with no canonical counterpart map to 'unknown'.
 */
const PAYMENT_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  NOT_PAID: 'PENDING',
  PENDING: 'PENDING',
  // "Payment received, but not yet confirmed by the payment provider."
  PENDING_MERCHANT: 'PENDING',
  PAID: 'PAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  FULLY_REFUNDED: 'REFUNDED',
}

/** `fulfillmentStatus` enum: NOT_FULFILLED, FULFILLED, PARTIALLY_FULFILLED. */
const FULFILLMENT_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  NOT_FULFILLED: 'UNFULFILLED',
  PARTIALLY_FULFILLED: 'PARTIAL',
  FULFILLED: 'FULFILLED',
}

function mapLineItem(raw: RawWixLineItem, orderId: string, currency: string | undefined): LineItem {
  if (!raw.id) throw new Error(`Wix order ${orderId} has a line item with no id`)
  const title = raw.productName?.original
  if (!title)
    throw new Error(`Wix order ${orderId} line item ${raw.id} has no productName.original`)
  if (typeof raw.quantity !== 'number') {
    throw new Error(`Wix order ${orderId} line item ${raw.id} has no quantity`)
  }
  // The canonical unit price comes before discounts, which `totalDiscount`
  // carries separately. Wix documents `priceBeforeDiscounts` as defaulting
  // to `price` when it is not provided.
  const price = wixPriceToMoney(raw.priceBeforeDiscounts ?? raw.price, currency)
  if (!price) {
    throw new Error(
      `Wix order ${orderId} line item ${raw.id} has no price.amount in the order currency`,
    )
  }
  return {
    id: raw.id,
    productId: raw.catalogReference?.catalogItemId || undefined,
    title,
    quantity: raw.quantity,
    price,
    totalDiscount: wixPriceToMoney(raw.totalDiscount, currency),
    sku: raw.physicalProperties?.sku || undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * The recipient's address. A pickup order has none: its `pickupDetails`, or
 * its `shippingDestination`, holds the store's or pickup point's address.
 */
function shippingAddress(raw: RawWixOrder): Address | undefined {
  const logistics = raw.shippingInfo?.logistics
  if (!logistics || logistics.pickupDetails) return undefined
  return mapAddress(logistics.shippingDestination?.address)
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformOrder(raw: RawWixOrder): Order {
  if (!raw.id) throw new Error('Wix order has no id')
  const currency = raw.currency || undefined
  const ps = raw.priceSummary
  const codes = (raw.appliedDiscounts ?? [])
    .map((d) => d.coupon?.code)
    .filter((c): c is string => typeof c === 'string' && c.length > 0)

  return {
    id: raw.id,
    orderNumber: raw.number != null ? String(raw.number) : undefined,
    customerId: raw.buyerInfo?.contactId || undefined,
    email: raw.buyerInfo?.email || undefined,
    phone: raw.billingInfo?.contactDetails?.phone || undefined,
    currency,
    subtotalPrice: wixPriceToMoney(ps?.subtotal, currency),
    totalTax: wixPriceToMoney(ps?.tax, currency),
    totalDiscounts: wixPriceToMoney(ps?.discount, currency),
    totalShipping: wixPriceToMoney(ps?.shipping, currency),
    totalPrice: wixPriceToMoney(ps?.total, currency),
    financialStatus: raw.paymentStatus
      ? (PAYMENT_STATUS_MAP[raw.paymentStatus] ?? 'unknown')
      : undefined,
    fulfillmentStatus: raw.fulfillmentStatus
      ? (FULFILLMENT_STATUS_MAP[raw.fulfillmentStatus] ?? 'unknown')
      : undefined,
    lineItems: (raw.lineItems ?? []).map((li) => mapLineItem(li, raw.id!, currency)),
    billingAddress: mapAddress(raw.billingInfo?.address),
    shippingAddress: shippingAddress(raw),
    discountCodes: codes.length > 0 ? codes : undefined,
    note: raw.buyerNote || undefined,
    createdAt: toIsoDatetime(raw.createdDate),
    updatedAt: toIsoDatetime(raw.updatedDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Wix order body (for update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    buyerNote: order.note,
  }
}
