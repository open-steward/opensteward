/**
 * Daraz Order → canonical Order.
 *
 * Daraz's `/orders/get` returns order envelopes. `/order/items/get`
 * returns line items (order items) per order. The adapter merges these
 * in `getOrder`.
 *
 * Order status mapping:
 *   pending → PENDING / UNFULFILLED
 *   packed → PAID / PARTIAL
 *   ready_to_ship → PAID / PARTIAL
 *   shipped → PAID / PARTIAL
 *   delivered → PAID / FULFILLED
 *   returned → REFUNDED / RESTOCKED
 *   failed → VOIDED / UNFULFILLED
 *   cancelled → VOIDED / UNFULFILLED
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawDarazOrderItem {
  order_item_id?: number | string
  shop_sku?: string
  sku?: string
  name?: string
  paid_price?: string | number
  item_price?: string | number
  tax_amount?: string | number
  shipping_amount?: string | number
  voucher_amount?: string | number
  quantity?: number
  status?: string
  product_id?: string | number
  variation?: string
  [key: string]: unknown
}

export interface RawDarazOrder {
  order_id?: number | string
  order_number?: string | number
  customer_first_name?: string
  customer_last_name?: string
  created_at?: string
  updated_at?: string
  statuses?: string[]
  price?: string | number
  payment_method?: string
  items_count?: number
  voucher?: string | number
  shipping_fee?: string | number
  /** Hydrated by the adapter when fetching full order details. */
  order_items?: RawDarazOrderItem[]
  address_shipping?: {
    first_name?: string
    last_name?: string
    address1?: string
    address2?: string
    city?: string
    post_code?: string
    country?: string
    phone?: string
    [key: string]: unknown
  }
  address_billing?: {
    first_name?: string
    last_name?: string
    address1?: string
    address2?: string
    city?: string
    post_code?: string
    country?: string
    phone?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseNumber(val: string | number | undefined): number {
  if (val == null) return 0
  const n = typeof val === 'number' ? val : parseFloat(val)
  return Number.isNaN(n) ? 0 : n
}

/**
 * Map Daraz order status to canonical financial status.
 */
export function mapFinancialStatus(
  statuses: string[] | undefined,
): OrderFinancialStatus | undefined {
  if (!statuses || statuses.length === 0) return undefined
  const primary = statuses[0]!.toLowerCase()
  switch (primary) {
    case 'pending':
      return 'PENDING'
    case 'packed':
    case 'ready_to_ship':
    case 'shipped':
    case 'delivered':
      return 'PAID'
    case 'returned':
      return 'REFUNDED'
    case 'failed':
    case 'cancelled':
      return 'VOIDED'
    default:
      return undefined
  }
}

/**
 * Map Daraz order status to canonical fulfillment status.
 */
export function mapFulfillmentStatus(
  statuses: string[] | undefined,
): OrderFulfillmentStatus | undefined {
  if (!statuses || statuses.length === 0) return undefined
  const primary = statuses[0]!.toLowerCase()
  switch (primary) {
    case 'pending':
    case 'failed':
    case 'cancelled':
      return 'UNFULFILLED'
    case 'packed':
    case 'ready_to_ship':
    case 'shipped':
      return 'PARTIAL'
    case 'delivered':
      return 'FULFILLED'
    case 'returned':
      return 'RESTOCKED'
    default:
      return undefined
  }
}

function mapAddress(
  raw: RawDarazOrder['address_shipping'],
): { line1?: string; line2?: string; city?: string; postalCode?: string; country?: string } | undefined {
  if (!raw) return undefined
  return {
    line1: raw.address1,
    line2: raw.address2,
    city: raw.city,
    postalCode: raw.post_code,
    country: raw.country,
  }
}

function mapLineItem(raw: RawDarazOrderItem, currency: string): LineItem {
  const unitPrice = majorToMinor(parseNumber(raw.paid_price ?? raw.item_price), currency)
  const qty = raw.quantity ?? 1
  return {
    id: String(raw.order_item_id ?? ''),
    productId: raw.product_id ? String(raw.product_id) : undefined,
    title: raw.name ?? raw.sku ?? '',
    quantity: qty,
    price: { amount: unitPrice, currency },
    sku: raw.sku ?? raw.shop_sku ?? undefined,
    totalDiscount:
      raw.voucher_amount ? { amount: majorToMinor(parseNumber(raw.voucher_amount), currency), currency } : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawDarazOrder, currency = 'USD'): Order {
  const lineItems = (raw.order_items ?? []).map((li) => mapLineItem(li, currency))
  const isCancelled =
    raw.statuses?.some((s) => s.toLowerCase() === 'cancelled') ?? false

  return {
    id: String(raw.order_id ?? ''),
    orderNumber: raw.order_number ? String(raw.order_number) : String(raw.order_id ?? ''),
    name: raw.order_number ? String(raw.order_number) : undefined,
    currency,
    totalPrice: raw.price != null ? { amount: majorToMinor(parseNumber(raw.price), currency), currency } : undefined,
    totalShipping:
      raw.shipping_fee != null
        ? { amount: majorToMinor(parseNumber(raw.shipping_fee), currency), currency }
        : undefined,
    totalDiscounts:
      raw.voucher != null ? { amount: majorToMinor(parseNumber(raw.voucher), currency), currency } : undefined,
    financialStatus: mapFinancialStatus(raw.statuses),
    fulfillmentStatus: mapFulfillmentStatus(raw.statuses),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippingAddress: mapAddress(raw.address_shipping),
    billingAddress: mapAddress(raw.address_billing),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    cancelledAt: isCancelled ? raw.updated_at : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
