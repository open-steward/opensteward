/**
 * Mercado Libre Order → canonical Order.
 *
 * Mercado Libre's Orders API returns orders via:
 *   GET /orders/search?seller={sellerId} → list (seller-scoped)
 *   GET /orders/{orderId} → get
 *
 * Money amounts in ML are plain numbers with a separate currency_id field.
 * Orders contain order_items[], payments[], and shipping references.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawMeliOrderItem {
  item: {
    id: string
    title: string
    category_id?: string
    variation_id?: number | null
    seller_custom_field?: string | null
    seller_sku?: string | null
  }
  quantity: number
  unit_price: number
  full_unit_price?: number
  currency_id: string
  manufacturing_days?: number | null
  sale_fee?: number
  listing_type_id?: string
  [key: string]: unknown
}

export interface RawMeliPayment {
  id: number
  order_id?: number
  payer_id?: number
  status: string
  status_detail?: string
  transaction_amount?: number
  currency_id?: string
  date_created?: string
  date_approved?: string
  payment_method_id?: string
  payment_type?: string
  [key: string]: unknown
}

export interface RawMeliShippingInfo {
  id?: number
  status?: string
  substatus?: string
  date_created?: string
  receiver_address?: {
    street_name?: string
    street_number?: string
    city?: { name?: string }
    state?: { name?: string }
    country?: { id?: string; name?: string }
    zip_code?: string
    latitude?: number
    longitude?: number
    comment?: string
  }
  [key: string]: unknown
}

export interface RawMeliBuyer {
  id: number
  nickname?: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: { number?: string; area_code?: string }
  [key: string]: unknown
}

export interface RawMeliOrder {
  id: number
  status: string
  status_detail?: {
    code?: string
    description?: string
  } | null
  date_created: string
  date_closed?: string
  last_updated?: string
  currency_id: string
  total_amount: number
  paid_amount?: number
  coupon?: { amount?: number; id?: number | null }
  order_items: RawMeliOrderItem[]
  payments?: RawMeliPayment[]
  shipping?: RawMeliShippingInfo
  buyer?: RawMeliBuyer
  seller?: { id: number; nickname?: string }
  tags?: string[]
  pack_id?: number | null
  mediations?: unknown[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * ML order status → canonical financial status.
 * ML statuses: paid, payment_required, payment_in_process, partially_paid,
 *              cancelled, invalid
 */
export function mapFinancialStatus(
  status: string | undefined,
  payments: RawMeliPayment[] | undefined,
): OrderFinancialStatus | undefined {
  if (!status) return undefined

  // Check if any payment is refunded
  const hasRefund = payments?.some((p) => p.status === 'refunded')
  if (hasRefund) {
    const allRefunded = payments?.every(
      (p) => p.status === 'refunded' || p.status === 'cancelled',
    )
    return allRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
  }

  switch (status) {
    case 'paid':
      return 'PAID'
    case 'payment_required':
    case 'payment_in_process':
      return 'PENDING'
    case 'partially_paid':
      return 'PARTIALLY_PAID'
    case 'cancelled':
    case 'invalid':
      return 'VOIDED'
    default:
      return undefined
  }
}

/**
 * ML shipping status → canonical fulfillment status.
 * ML shipping statuses: pending, handling, ready_to_ship, shipped, delivered,
 *                       not_delivered, cancelled, returned_to_sender
 */
export function mapFulfillmentStatus(
  shippingStatus: string | undefined,
): OrderFulfillmentStatus | undefined {
  if (!shippingStatus) return 'UNFULFILLED'
  switch (shippingStatus) {
    case 'delivered':
    case 'shipped':
      return 'FULFILLED'
    case 'handling':
    case 'ready_to_ship':
      return 'PARTIAL'
    case 'pending':
    case 'not_delivered':
      return 'UNFULFILLED'
    case 'cancelled':
    case 'returned_to_sender':
      return 'RESTOCKED'
    default:
      return 'UNFULFILLED'
  }
}

function mapLineItem(raw: RawMeliOrderItem): LineItem {
  return {
    id: raw.item.id,
    productId: raw.item.id,
    title: raw.item.title,
    quantity: raw.quantity,
    price: { amount: raw.unit_price, currency: raw.currency_id },
    sku: raw.item.seller_sku ?? raw.item.seller_custom_field ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function mapShippingAddress(shipping: RawMeliShippingInfo | undefined) {
  const addr = shipping?.receiver_address
  if (!addr) return undefined
  const line1 = [addr.street_name, addr.street_number].filter(Boolean).join(' ') || undefined
  return {
    line1,
    city: addr.city?.name,
    region: addr.state?.name,
    postalCode: addr.zip_code,
    country: addr.country?.id,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawMeliOrder): Order {
  const currency = raw.currency_id
  const lineItems = (raw.order_items ?? []).map(mapLineItem)
  const shippingAddress = mapShippingAddress(raw.shipping)
  const isCancelled = raw.status === 'cancelled'

  // Calculate totals
  const totalAmount = raw.total_amount
  const couponDiscount = raw.coupon?.amount

  return {
    id: String(raw.id),
    orderNumber: String(raw.id),
    name: `#${raw.id}`,
    email: raw.buyer?.email,
    phone: raw.buyer?.phone
      ? [raw.buyer.phone.area_code, raw.buyer.phone.number].filter(Boolean).join('')
      : undefined,
    currency,
    totalPrice: { amount: totalAmount, currency },
    totalDiscounts: couponDiscount ? { amount: couponDiscount, currency } : undefined,
    financialStatus: mapFinancialStatus(raw.status, raw.payments),
    fulfillmentStatus: mapFulfillmentStatus(raw.shipping?.status),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippingAddress,
    tags: raw.tags,
    createdAt: toIsoDatetime(raw.date_created),
    updatedAt: toIsoDatetime(raw.last_updated),
    processedAt: toIsoDatetime(raw.date_closed),
    cancelledAt: isCancelled ? raw.last_updated : undefined,
    cancelReason: isCancelled ? raw.status_detail?.description : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
