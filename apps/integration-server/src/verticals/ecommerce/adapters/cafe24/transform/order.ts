/**
 * Cafe24 Order → canonical Order.
 *
 * Cafe24 order field conventions:
 *   - `order_id`              → string order id (e.g. "20240115-0000001")
 *   - `order_date`            → ISO-8601 order creation timestamp
 *   - `buyer_name`            → customer display name
 *   - `buyer_email`           → customer email
 *   - `buyer_phone`           → customer phone
 *   - `order_price_amount`    → subtotal (decimal, KRW by default)
 *   - `shipping_price`        → shipping cost
 *   - `actual_price`          → total actually paid
 *   - `payment_status`        → financial status string
 *   - `order_status`          → overall order status
 *   - `order_items`           → array of purchased items
 *   - `shipping_address`      → recipient delivery address
 *   - `billing_address`       → billing address (may equal shipping)
 *
 * Cafe24 uses Korean Won (KRW) as the default currency — an integer-unit
 * currency with no fractional digits, so major-unit === minor-unit.
 *
 * Docs: https://developers.cafe24.com/docs/en/api/admin/#orders
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Cafe24 shapes ─────────────────────────────────────────────────────────

export interface RawCafe24Address {
  name?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  zipcode?: string | null
  country_code?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface RawCafe24OrderItem {
  order_item_code?: string | null
  product_no?: number | string | null
  variant_code?: string | null
  product_name?: string | null
  quantity?: number | null
  product_price?: string | number | null
  actual_product_price?: string | number | null
  product_code?: string | null
  [key: string]: unknown
}

export interface RawCafe24Order {
  order_id: string
  order_date?: string | null
  order_status?: string | null
  payment_status?: string | null
  buyer_name?: string | null
  buyer_email?: string | null
  buyer_phone?: string | null
  member_id?: string | null
  currency?: string | null
  order_price_amount?: string | number | null
  shipping_price?: string | number | null
  actual_price?: string | number | null
  tax?: string | number | null
  order_items?: RawCafe24OrderItem[]
  shipping_address?: RawCafe24Address | null
  billing_address?: RawCafe24Address | null
  coupon_discount_price?: string | number | null
  use_coupon?: string | null
  inflow?: string | null
  note?: string | null
  updated_date?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : 0
}

function toMinor(v: string | number | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

function mapAddress(raw: RawCafe24Address | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zipcode ?? undefined
  const country = raw.country_code ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address2 ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

/**
 * Map Cafe24 payment_status to canonical OrderFinancialStatus.
 *
 * Cafe24 status strings (from docs):
 *   awaiting_payment, payment_complete, payment_cancel, refund_complete, etc.
 */
const FIN_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  awaiting_payment: 'PENDING',
  payment_complete: 'PAID',
  payment_cancel: 'VOIDED',
  refund_complete: 'REFUNDED',
  partial_refund: 'PARTIALLY_REFUNDED',
  refund_pending: 'PARTIALLY_REFUNDED',
}

/**
 * Map Cafe24 order_status to canonical OrderFulfillmentStatus.
 *
 * Cafe24 order_status strings (relevant subset):
 *   order_complete, preparing, in_transit, delivered, etc.
 */
const FUL_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  order_complete: 'UNFULFILLED',
  preparing: 'UNFULFILLED',
  preparing_product: 'UNFULFILLED',
  hold: 'UNFULFILLED',
  delivering: 'PARTIAL',
  in_transit: 'PARTIAL',
  shipped: 'PARTIAL',
  delivered: 'FULFILLED',
  delivery_complete: 'FULFILLED',
}

function mapLineItem(raw: RawCafe24OrderItem, currency: string): LineItem {
  return {
    id: String(raw.order_item_code ?? ''),
    productId: raw.product_no != null ? String(raw.product_no) : undefined,
    variantId: raw.variant_code != null ? String(raw.variant_code) : undefined,
    title: String(raw.product_name ?? ''),
    quantity: typeof raw.quantity === 'number' ? raw.quantity : 0,
    price: {
      amount: toMinor(raw.actual_product_price ?? raw.product_price, currency),
      currency,
    },
    sku: raw.product_code ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawCafe24Order): Order {
  const currency = raw.currency ?? 'KRW'
  const money = (v: string | number | null | undefined) => ({
    amount: toMinor(v, currency),
    currency,
  })

  const paymentStatus = raw.payment_status?.toLowerCase() ?? ''
  const orderStatus = raw.order_status?.toLowerCase() ?? ''

  return {
    id: String(raw.order_id),
    orderNumber: String(raw.order_id),
    name: String(raw.order_id),
    customerId: raw.member_id ?? undefined,
    email: raw.buyer_email ?? undefined,
    phone: raw.buyer_phone ?? undefined,
    currency,
    subtotalPrice: raw.order_price_amount != null ? money(raw.order_price_amount) : undefined,
    totalTax: raw.tax != null ? money(raw.tax) : undefined,
    totalDiscounts:
      raw.coupon_discount_price != null ? money(raw.coupon_discount_price) : undefined,
    totalShipping: raw.shipping_price != null ? money(raw.shipping_price) : undefined,
    totalPrice: raw.actual_price != null ? money(raw.actual_price) : undefined,
    financialStatus: FIN_STATUS_MAP[paymentStatus] ?? undefined,
    fulfillmentStatus: FUL_STATUS_MAP[orderStatus] ?? undefined,
    lineItems: (raw.order_items ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    note: raw.note ?? undefined,
    createdAt: toIsoDatetime(raw.order_date),
    updatedAt: toIsoDatetime(raw.updated_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Cafe24 order body (for update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (order.note != null) body.note = order.note
  if (order.email != null) body.buyer_email = order.email
  if (order.phone != null) body.buyer_phone = order.phone
  return body
}
