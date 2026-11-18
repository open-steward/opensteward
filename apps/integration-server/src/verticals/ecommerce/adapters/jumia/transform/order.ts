/**
 * Jumia Order → canonical Order.
 *
 * Jumia's `/orders` endpoint returns order envelopes with embedded items.
 *
 * Order status mapping:
 *   pending        → PENDING / UNFULFILLED
 *   processing     → PAID / UNFULFILLED
 *   ready_to_ship  → PAID / PARTIAL
 *   shipped        → PAID / PARTIAL
 *   delivered      → PAID / FULFILLED
 *   returned       → REFUNDED / RESTOCKED
 *   failed         → VOIDED / UNFULFILLED
 *   cancelled      → VOIDED / UNFULFILLED
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawJumiaOrderItem {
  order_item_id?: string | number
  sku?: string
  seller_sku?: string
  name?: string
  paid_price?: number | string
  unit_price?: number | string
  tax_amount?: number | string
  shipping_amount?: number | string
  voucher_amount?: number | string
  quantity?: number
  status?: string
  product_id?: string | number
  [key: string]: unknown
}

export interface RawJumiaOrder {
  order_id?: string | number
  order_number?: string | number
  customer_first_name?: string
  customer_last_name?: string
  created_at?: string
  updated_at?: string
  status?: string
  statuses?: string[]
  price?: number | string
  payment_method?: string
  items_count?: number
  voucher?: number | string
  shipping_fee?: number | string
  order_items?: RawJumiaOrderItem[]
  shipping_address?: {
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
  billing_address?: {
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
 * Resolve the primary status from the order. Jumia may use a single `status`
 * string or a `statuses` array depending on the API version.
 */
function primaryStatus(raw: RawJumiaOrder): string | undefined {
  if (raw.status) return raw.status
  if (raw.statuses && raw.statuses.length > 0) return raw.statuses[0]
  return undefined
}

/**
 * Map Jumia order status to canonical financial status.
 */
export function mapFinancialStatus(
  raw: RawJumiaOrder,
): OrderFinancialStatus | undefined {
  const status = primaryStatus(raw)?.toLowerCase()
  if (!status) return undefined
  switch (status) {
    case 'pending':
      return 'PENDING'
    case 'processing':
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
 * Map Jumia order status to canonical fulfillment status.
 */
export function mapFulfillmentStatus(
  raw: RawJumiaOrder,
): OrderFulfillmentStatus | undefined {
  const status = primaryStatus(raw)?.toLowerCase()
  if (!status) return undefined
  switch (status) {
    case 'pending':
    case 'processing':
    case 'failed':
    case 'cancelled':
      return 'UNFULFILLED'
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
  raw: RawJumiaOrder['shipping_address'],
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

function mapLineItem(raw: RawJumiaOrderItem, currency: string): LineItem {
  const unitPrice = parseNumber(raw.paid_price ?? raw.unit_price)
  const qty = raw.quantity ?? 1
  return {
    id: String(raw.order_item_id ?? ''),
    productId: raw.product_id ? String(raw.product_id) : undefined,
    title: raw.name ?? raw.sku ?? '',
    quantity: qty,
    price: { amount: unitPrice, currency },
    sku: raw.seller_sku ?? raw.sku ?? undefined,
    totalDiscount:
      raw.voucher_amount ? { amount: parseNumber(raw.voucher_amount), currency } : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawJumiaOrder, currency = 'NGN'): Order {
  const lineItems = (raw.order_items ?? []).map((li) => mapLineItem(li, currency))
  const status = primaryStatus(raw)?.toLowerCase()
  const isCancelled = status === 'cancelled'

  return {
    id: String(raw.order_id ?? ''),
    orderNumber: raw.order_number ? String(raw.order_number) : String(raw.order_id ?? ''),
    name: raw.order_number ? String(raw.order_number) : undefined,
    currency,
    totalPrice: raw.price != null ? { amount: parseNumber(raw.price), currency } : undefined,
    totalShipping:
      raw.shipping_fee != null
        ? { amount: parseNumber(raw.shipping_fee), currency }
        : undefined,
    totalDiscounts:
      raw.voucher != null ? { amount: parseNumber(raw.voucher), currency } : undefined,
    financialStatus: mapFinancialStatus(raw),
    fulfillmentStatus: mapFulfillmentStatus(raw),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippingAddress: mapAddress(raw.shipping_address),
    billingAddress: mapAddress(raw.billing_address),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    cancelledAt: isCancelled ? raw.updated_at : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
