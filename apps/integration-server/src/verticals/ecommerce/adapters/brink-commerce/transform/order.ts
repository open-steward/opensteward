/**
 * Brink Commerce Order / OrderSummary → canonical Order.
 *
 * Shapes are the OrderManagement OpenAPI embedded in
 * https://docs.brinkcommerce.com/technical/api-references/order/orders.md:
 *  - `GET /orders/{orderId}` returns `Order`;
 *  - `GET /orders/email/{email}` and `GET /orders/merchant-ref1/{merchantRef1}`
 *    return `OrderSummaries` `{ orderSummaries: OrderSummary[] }`. A summary has
 *    no lines or addresses (its required fields are id, date,
 *    isTaxIncludedInPrice, totals, languageCode, reference, storeGroupId,
 *    countryCode, currencyCode, channelType, isTaxExemptionEligible,
 *    isTaxExempt, taxationCountry, status).
 *
 * Money: the OrderLine model says "Monetary fields on this object are in the
 * order's currency's minor units (e.g. `2500` = `25.00 SEK`)"
 * (https://docs.brinkcommerce.com/technical/api-references/order/models.md),
 * and the order `totals` are integer sums of those lines, so amounts pass
 * through unscaled in `currencyCode`.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'

// ── Raw Brink Commerce shapes (documented fields only) ──────────────────────

/** `OrderAddress`: required country, telephoneNumber, stateOrProvince, streetAddress, city, givenName, postalCode, streetAddress2, email. */
export interface RawBrinkAddress {
  country?: string
  telephoneNumber?: string
  stateOrProvince?: string
  streetAddress?: string
  streetAddress2?: string
  city?: string
  givenName?: string
  familyName?: string
  postalCode?: string
  email?: string
  [key: string]: unknown
}

/** `OrderLine`. */
export interface RawBrinkOrderLine {
  id: string
  productVariantId: string
  productParentId: string
  quantity: number
  displayName: string
  name: string
  salePriceAmount: number
  totalDiscountAmount: number
  currencyCode: string
  [key: string]: unknown
}

/** `OrderStatus`. */
export interface RawBrinkOrderStatus {
  orderStates: string[]
  customStates?: Array<{ id: string; type: string; operations?: string[] }>
}

/** `OrderTotals`: all required. */
export interface RawBrinkOrderTotals {
  subTotal: number
  shippingTotal: number
  discountTotal: number
  giftCardTotal: number
  bonusTotal: number
  taxTotal: number
  grandTotal: number
}

/** `DiscountCodeRule` on an order: required code, freeShipping, name, discountAmount, id, currencyCode. */
export interface RawBrinkDiscountCodeRule {
  id: string
  code: string
  name: string
  freeShipping: boolean
  discountAmount: number
  currencyCode: string
}

/** `OrderSummary`, one row of `orderSummaries`. */
export interface RawBrinkOrderSummary {
  id: string
  reference: string
  date: string
  currencyCode: string
  totals: RawBrinkOrderTotals
  status: RawBrinkOrderStatus
  [key: string]: unknown
}

/** `Order`. */
export interface RawBrinkOrder extends RawBrinkOrderSummary {
  orderLines: RawBrinkOrderLine[]
  billingAddress?: RawBrinkAddress
  shippingAddress?: RawBrinkAddress
  discountCodeRules?: RawBrinkDiscountCodeRule[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: RawBrinkAddress | undefined): Address | undefined {
  if (!raw) return undefined
  return {
    line1: raw.streetAddress || undefined,
    line2: raw.streetAddress2 || undefined,
    city: raw.city || undefined,
    region: raw.stateOrProvince || undefined,
    postalCode: raw.postalCode || undefined,
    country: raw.country || undefined,
  }
}

/**
 * Brink `orderStates` ("List of order states that the order is currently in"):
 * PLACED, CANCELLED, FULLY_DELIVERED, PARTIALLY_DELIVERED, FULLY_REFUNDED,
 * PARTIALLY_REFUNDED, FULLY_COMPENSATED, PARTIALLY_COMPENSATED, RELEASED.
 * RELEASED is documented as "Order has released remaining authorized amount",
 * i.e. a placed order holds an authorisation; a delivery captures it
 * (`DeliveryDetails.capturedPayment`).
 */
function mapStatuses(states: string[]): {
  financialStatus?: OrderFinancialStatus
  fulfillmentStatus?: OrderFulfillmentStatus
} {
  const set = new Set(states)

  let financialStatus: OrderFinancialStatus | undefined
  if (set.has('FULLY_REFUNDED')) financialStatus = 'REFUNDED'
  else if (set.has('PARTIALLY_REFUNDED')) financialStatus = 'PARTIALLY_REFUNDED'
  else if (set.has('CANCELLED')) financialStatus = 'VOIDED'
  else if (set.has('FULLY_DELIVERED')) financialStatus = 'PAID'
  else if (set.has('PARTIALLY_DELIVERED')) financialStatus = 'PARTIALLY_PAID'
  else if (set.has('PLACED')) financialStatus = 'AUTHORIZED'

  let fulfillmentStatus: OrderFulfillmentStatus | undefined
  if (set.has('FULLY_DELIVERED')) fulfillmentStatus = 'FULFILLED'
  else if (set.has('PARTIALLY_DELIVERED')) fulfillmentStatus = 'PARTIAL'
  else if (set.has('PLACED')) fulfillmentStatus = 'UNFULFILLED'

  return { financialStatus, fulfillmentStatus }
}

function mapLineItem(raw: RawBrinkOrderLine): LineItem {
  return {
    id: raw.id,
    productId: raw.productParentId,
    variantId: raw.productVariantId,
    title: raw.displayName,
    quantity: raw.quantity,
    price: { amount: raw.salePriceAmount, currency: raw.currencyCode },
    totalDiscount: { amount: raw.totalDiscountAmount, currency: raw.currencyCode },
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function requireCurrency(raw: RawBrinkOrderSummary): string {
  if (!raw.currencyCode) {
    throw new Error(`Brink Commerce order ${raw.id} has no currencyCode (a required field)`)
  }
  return raw.currencyCode
}

// ── Transform ────────────────────────────────────────────────────────────────

/** One `OrderSummary` from the order-filter routes: header and totals only. */
export function transformOrderSummary(raw: RawBrinkOrderSummary): Order {
  const currency = requireCurrency(raw)
  const t = raw.totals
  return {
    id: raw.id,
    orderNumber: raw.reference,
    name: raw.reference,
    currency,
    subtotalPrice: { amount: t.subTotal, currency },
    totalTax: { amount: t.taxTotal, currency },
    totalDiscounts: { amount: t.discountTotal, currency },
    totalShipping: { amount: t.shippingTotal, currency },
    totalPrice: { amount: t.grandTotal, currency },
    ...mapStatuses(raw.status.orderStates),
    createdAt: toIsoDatetime(raw.date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** A full `Order` from `GET /orders/{orderId}`. */
export function transformOrder(raw: RawBrinkOrder): Order {
  const email = raw.billingAddress?.email
  return {
    ...transformOrderSummary(raw),
    email: email || undefined,
    lineItems: raw.orderLines.map(mapLineItem),
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: mapAddress(raw.shippingAddress),
    discountCodes: raw.discountCodeRules?.map((r) => r.code),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
