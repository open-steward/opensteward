/**
 * Flipkart Orders API → canonical Order.
 *
 * Flipkart's Orders API returns order items grouped by order. Each order
 * contains `orderItems` with product, quantity, pricing, and fulfillment
 * status.
 *
 * Flipkart does NOT expose buyer PII through the seller API — only a
 * masked buyer name / shipping address for fulfillment. The transform
 * maps the shipping address when available but does not surface email
 * or phone.
 *
 * Docs: https://seller.flipkart.com/api-docs/order-api-docs/OMAPIRef.html
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawFlipkartMoney {
  amount: number
  currency_code: string
}

export interface RawFlipkartAddress {
  name?: string
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  pincode?: string
  country?: string
  [key: string]: unknown
}

export interface RawFlipkartOrderItem {
  order_item_id: string
  order_id: string
  listing_id?: string
  sku_id?: string
  fsn?: string
  title?: string
  quantity: number
  selling_price?: RawFlipkartMoney
  shipping_charges?: RawFlipkartMoney
  buyer_name?: string
  shipping_address?: RawFlipkartAddress
  order_item_status?: string
  cancellation_reason?: string
  dispatch_by_date?: string
  dispatch_after_date?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface RawFlipkartOrder {
  order_id: string
  order_items: RawFlipkartOrderItem[]
  order_date?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(m: RawFlipkartMoney | undefined):
  | { amount: number; currency: string }
  | undefined {
  if (!m) return undefined
  return { amount: m.amount, currency: m.currency_code }
}

/**
 * Flipkart order item status → canonical fulfillment status.
 *
 * Flipkart's order item statuses include: APPROVED, PACKING, PACKED,
 * READY_TO_DISPATCH, SHIPPED, DELIVERED, CANCELLED, RETURN_REQUESTED, RETURNED.
 */
export function mapFulfillmentStatus(
  items: RawFlipkartOrderItem[],
): OrderFulfillmentStatus | undefined {
  if (!items || items.length === 0) return undefined
  const statuses = items.map((i) => (i.order_item_status ?? '').toUpperCase())
  if (statuses.every((s) => s === 'DELIVERED')) return 'FULFILLED'
  if (statuses.every((s) => s === 'CANCELLED')) return 'UNFULFILLED'
  if (statuses.some((s) => s === 'SHIPPED' || s === 'DELIVERED')) return 'PARTIAL'
  return 'UNFULFILLED'
}

/**
 * Flipkart order item statuses → canonical financial status.
 * Flipkart doesn't expose a separate financial status; we infer from
 * item statuses.
 */
export function mapFinancialStatus(
  items: RawFlipkartOrderItem[],
): OrderFinancialStatus | undefined {
  if (!items || items.length === 0) return undefined
  const statuses = items.map((i) => (i.order_item_status ?? '').toUpperCase())
  if (statuses.every((s) => s === 'DELIVERED')) return 'PAID'
  if (statuses.every((s) => s === 'CANCELLED')) return 'VOIDED'
  if (statuses.some((s) => s === 'DELIVERED' || s === 'SHIPPED')) return 'PARTIALLY_PAID'
  return 'PENDING'
}

function mapAddress(raw: RawFlipkartAddress | undefined): Address | undefined {
  if (!raw) return undefined
  return {
    line1: raw.address_line1,
    line2: raw.address_line2,
    city: raw.city,
    region: raw.state,
    postalCode: raw.pincode,
    country: raw.country,
  }
}

function mapLineItem(raw: RawFlipkartOrderItem): LineItem {
  const price = toMoney(raw.selling_price)
  return {
    id: raw.order_item_id,
    title: raw.title ?? raw.sku_id ?? raw.listing_id ?? 'Unknown',
    quantity: raw.quantity,
    price: price ?? { amount: 0, currency: 'INR' },
    sku: raw.sku_id,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawFlipkartOrder): Order {
  const items = raw.order_items ?? []
  const lineItems = items.map(mapLineItem)

  // Compute total from line items
  const currency = items[0]?.selling_price?.currency_code ?? 'INR'
  const totalAmount = items.reduce(
    (acc, item) => acc + (item.selling_price?.amount ?? 0) * item.quantity,
    0,
  )

  // Extract shipping address from the first item (all items share the same address)
  const shippingAddress = mapAddress(items[0]?.shipping_address)

  // Determine cancellation
  const allCancelled = items.length > 0 && items.every(
    (i) => (i.order_item_status ?? '').toUpperCase() === 'CANCELLED',
  )

  return {
    id: raw.order_id,
    orderNumber: raw.order_id,
    name: raw.order_id,
    customerId: undefined,
    email: undefined,
    phone: undefined,
    currency,
    totalPrice: totalAmount > 0 ? { amount: totalAmount, currency } : undefined,
    financialStatus: mapFinancialStatus(items),
    fulfillmentStatus: mapFulfillmentStatus(items),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    billingAddress: undefined,
    shippingAddress,
    createdAt: raw.order_date,
    updatedAt: raw.updated_at,
    processedAt: raw.order_date,
    cancelledAt: allCancelled ? raw.updated_at : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
