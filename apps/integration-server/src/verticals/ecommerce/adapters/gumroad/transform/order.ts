/**
 * Gumroad Sale → canonical Order.
 *
 * Gumroad calls orders "sales". A sale has an `id`, a `product_id`,
 * `email`, `price` (in cents), `currency_code`, and various timestamps.
 *
 * Key mapping:
 *  - `id` → canonical `id`
 *  - `order_number` → canonical `orderNumber`
 *  - `product_id` + `product_name` → single line item
 *  - `email` → canonical `email`
 *  - `price` (cents) → canonical `totalPrice`
 *  - `refunded` boolean → financial status
 *  - `created_at` → canonical `createdAt`
 *
 * Gumroad sales are always for a single product, so each sale
 * maps to an order with one line item.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawGumroadSale {
  id: string
  email?: string
  seller_id?: string
  order_number?: number
  product_id?: string
  product_name?: string
  product_permalink?: string
  quantity?: number
  price: number // in cents
  currency_code?: string
  recurrence?: string | null
  refunded?: boolean
  partially_refunded?: boolean
  chargebacked?: boolean
  disputed?: boolean
  dispute_won?: boolean
  subscription_id?: string | null
  is_gift_receiver_purchase?: boolean
  referrer?: string | null
  ip_country?: string | null
  variants?: string | null
  license_key?: string | null
  custom_fields?: Record<string, unknown>
  created_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a Gumroad price to canonical money. Gumroad reports prices in
 * integer minor units (cents), which already matches the canonical
 * integer-minor-units contract — pass it through unchanged.
 */
export function centsToMoney(
  cents: number | undefined,
  currency: string,
): { amount: number; currency: string } | undefined {
  if (cents == null) return undefined
  return { amount: Math.round(cents), currency }
}

/**
 * Map Gumroad sale state to canonical financial status.
 */
export function mapFinancialStatus(sale: RawGumroadSale): OrderFinancialStatus | undefined {
  if (sale.refunded === true) return 'REFUNDED'
  if (sale.partially_refunded === true) return 'PARTIALLY_REFUNDED'
  if (sale.chargebacked === true) return 'VOIDED'
  // All completed sales are paid
  return 'PAID'
}

/**
 * Map Gumroad sale to fulfillment status.
 * Digital products are always "fulfilled" upon purchase.
 */
export function mapFulfillmentStatus(_sale: RawGumroadSale): OrderFulfillmentStatus {
  return 'FULFILLED'
}

function mapLineItem(sale: RawGumroadSale): LineItem {
  const currency = sale.currency_code ?? 'USD'
  const price = centsToMoney(sale.price, currency) ?? { amount: 0, currency }
  return {
    id: sale.id,
    productId: sale.product_id ?? undefined,
    title: sale.product_name ?? sale.product_id ?? sale.id,
    quantity: sale.quantity ?? 1,
    price,
    metadata: sale as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawGumroadSale): Order {
  const currency = raw.currency_code ?? 'USD'
  const totalPrice = centsToMoney(raw.price, currency)

  return {
    id: raw.id,
    orderNumber: raw.order_number != null ? String(raw.order_number) : undefined,
    email: raw.email ?? undefined,
    currency,
    totalPrice,
    financialStatus: mapFinancialStatus(raw),
    fulfillmentStatus: mapFulfillmentStatus(raw),
    lineItems: [mapLineItem(raw)],
    createdAt: raw.created_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
