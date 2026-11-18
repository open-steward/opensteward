/**
 * Wish v3 Order → canonical Order.
 *
 * Shapes from the first-party v3 OpenAPI behind
 * https://merchant.wish.com/documentation/api/v3/reference:
 *   GET /api/v3/orders      → data: `Orders`, an array of `Order`
 *   GET /api/v3/orders/{id} → data: `Order`
 *
 * A Wish order is one product variation: `product_information` names "the
 * Product Variation that was ordered" and `general_payment_details` carries
 * "The number of units that the customer has purchased". So an order maps to
 * one line item, and only when the fields it needs are present.
 *
 * Money is the v3 `Price`/`Money` object, `{ amount, currency_code }`, amount
 * "in decimals"; each value carries its own currency. Nothing is defaulted.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address, Money } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw v3 shapes ────────────────────────────────────────────────────────────

/** v3 `Price` / `Money`: required ["amount", "currency_code"]. */
export interface RawWishMoney {
  amount: number
  currency_code: string
}

/** v3 `OrderShippingDetail` (Address fields; required street_address1, city, state, zipcode, country_code). */
export interface RawWishShippingDetail {
  name?: string
  street_address1?: string
  street_address2?: string
  city?: string
  state?: string
  zipcode?: string
  /** "The 2-letter country code defined in ISO 3166." */
  country_code?: string
  country?: string
}

/** v3 `Order`. */
export interface RawWishOrder {
  /** "Returns the order's unique identifier" */
  id?: string
  /** `State`: ["APPROVED", "SHIPPED", "REFUNDED", "REQUIRE_REVIEW", "DECLINED"] */
  state?: string
  /** "Returns the time when order was last updated." */
  updated_at?: string
  /** "Returns the time when order was released." */
  released_at?: string
  product_information?: {
    /** "The sku of the variation" */
    sku?: string
    /** "The name of the product" */
    name?: string
    /** "Wish's unique identifier for the Product Variation that was ordered" */
    variation_id?: string
    /** "Wish's unique identifier for the Product being ordered" */
    id?: string
    [key: string]: unknown
  }
  order_payment?: {
    general_payment_details?: {
      /** "The price of the product after any redistribution" */
      product_price?: RawWishMoney
      /** "The number of units that the customer has purchased" */
      product_quantity?: number
      /** Only on "certain UK-bound orders, or certain orders originating from BR/MX". */
      customer_paid_prices_detail?: {
        /** "Total" */
        total?: RawWishMoney
        /** "Shipping price total" */
        shipping_price_total?: RawWishMoney
      }
    }
  }
  /** "Returns the order's destination address(es)." */
  full_address?: {
    shipping_detail?: RawWishShippingDetail
  }
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function money(m: RawWishMoney | undefined): Money | undefined {
  if (!m) return undefined
  return { amount: majorToMinor(m.amount, m.currency_code), currency: m.currency_code }
}

function mapShippingAddress(raw: RawWishShippingDetail | undefined): Address | undefined {
  if (!raw) return undefined
  return {
    line1: raw.street_address1,
    line2: raw.street_address2,
    city: raw.city,
    region: raw.state,
    postalCode: raw.zipcode,
    country: raw.country_code,
  }
}

/**
 * The documented `states`: "APPROVED: Order ready to be shipped.",
 * "SHIPPED: Order has been shipped.", "REFUNDED: Order has been refunded.",
 * "REQUIRE_REVIEW: Order has been placed under review", "DECLINED: Customer's
 * payment had an issue for this order". DECLINED has no canonical payment
 * state and stays unmapped.
 */
function mapFinancialStatus(state: string | undefined): OrderFinancialStatus | undefined {
  switch (state) {
    case 'APPROVED':
    case 'SHIPPED':
      return 'PAID'
    case 'REFUNDED':
      return 'REFUNDED'
    case 'REQUIRE_REVIEW':
      return 'PENDING'
    default:
      return undefined
  }
}

function mapFulfillmentStatus(state: string | undefined): OrderFulfillmentStatus | undefined {
  switch (state) {
    case 'APPROVED':
      return 'UNFULFILLED'
    case 'SHIPPED':
      return 'FULFILLED'
    default:
      return undefined
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawWishOrder): Order {
  if (!raw.id) throw new Error('Wish order has no id')
  const product = raw.product_information
  const payment = raw.order_payment?.general_payment_details
  const unitPrice = money(payment?.product_price)

  const lineItems: LineItem[] | undefined =
    product?.name !== undefined && payment?.product_quantity !== undefined && unitPrice
      ? [
          {
            // One variation per order, so the order id identifies its line.
            id: raw.id,
            productId: product.id,
            variantId: product.variation_id,
            title: product.name,
            quantity: payment.product_quantity,
            price: unitPrice,
            sku: product.sku,
            metadata: { product_information: product, general_payment_details: payment },
          },
        ]
      : undefined

  return {
    id: raw.id,
    totalPrice: money(payment?.customer_paid_prices_detail?.total),
    totalShipping: money(payment?.customer_paid_prices_detail?.shipping_price_total),
    financialStatus: mapFinancialStatus(raw.state),
    fulfillmentStatus: mapFulfillmentStatus(raw.state),
    lineItems,
    shippingAddress: mapShippingAddress(raw.full_address?.shipping_detail),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
