/**
 * Pinduoduo order → canonical Order.
 *
 * PDD returns order data from `pdd.order.list.get` (summaries) and
 * `pdd.order.information.get` (full details). The `order_sn` (order serial
 * number) is the canonical id; `order_id` (numeric) is also present.
 *
 * Prices in PDD are integers in fen (Chinese cents). They are converted to
 * CNY decimal on output (same as products).
 *
 * PDD order status codes:
 *   1 = WAIT_PAY              → financial: PENDING,   fulfillment: UNFULFILLED
 *   2 = WAIT_DELIVERY         → financial: PAID,      fulfillment: UNFULFILLED
 *   3 = WAIT_CONFIRM          → financial: PAID,      fulfillment: PARTIAL
 *   4 = FINISHED              → financial: PAID,      fulfillment: FULFILLED
 *   5 = CANCELLED             → financial: VOIDED,    fulfillment: UNFULFILLED
 *   6 = REFUNDING             → financial: PARTIALLY_REFUNDED, fulfillment: UNFULFILLED
 *   7 = COMPLETED             → financial: PAID,      fulfillment: FULFILLED
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { fenAsMinorUnits, unixToIso } from './product'
import {
  ORDER_STATUS_WAIT_PAY,
  ORDER_STATUS_WAIT_DELIVERY,
  ORDER_STATUS_WAIT_CONFIRM,
  ORDER_STATUS_FINISHED,
  ORDER_STATUS_CANCELLED,
  ORDER_STATUS_REFUNDING,
  ORDER_STATUS_COMPLETED,
} from '../constants'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawPddOrderItem {
  /** Sub-order ID (order line item). */
  sub_order_sn?: string
  /** Goods ID. */
  goods_id?: string | number
  /** SKU ID. */
  sku_id?: string | number
  /** Goods name at time of purchase. */
  goods_name?: string
  /** SKU spec string. */
  goods_spec?: string
  /** Outer (seller-defined) goods ID. */
  outer_goods_id?: string
  /** Outer (seller-defined) SKU ID. */
  outer_sku_sn?: string
  /** Quantity purchased. */
  goods_count?: number
  /** Unit price in fen. */
  goods_price?: number
  /** Line item total in fen (price × quantity). */
  goods_amount?: number
  /** Thumbnail URL for this item. */
  goods_thumbnail_url?: string
  [key: string]: unknown
}

export interface RawPddOrder {
  /** PDD order serial number (primary identifier). */
  order_sn?: string
  /** PDD numeric order ID (secondary identifier). */
  order_id?: string | number
  /**
   * Order status code:
   *   1=WAIT_PAY, 2=WAIT_DELIVERY, 3=WAIT_CONFIRM,
   *   4=FINISHED, 5=CANCELLED, 6=REFUNDING, 7=COMPLETED
   */
  order_status?: number
  /** Total order amount in fen (after discounts). */
  order_amount?: number
  /** Goods amount in fen (before discounts). */
  goods_amount?: number
  /** Discount amount in fen. */
  discount_amount?: number
  /** Shipping fee in fen. */
  freight_amount?: number
  /** Coupon amount in fen. */
  coupon_amount?: number
  /** Platform subsidy in fen. */
  platform_discount_amount?: number
  /** Currency (always CNY for domestic PDD). */
  currency?: string
  /** Buyer's PDD user ID. */
  buyer_id?: string | number
  /** Buyer's masked mobile number (partially hidden by PDD). */
  receiver_phone?: string
  /** Receiver's full name. */
  receiver_name?: string
  /** Receiver's province. */
  receiver_province?: string
  /** Receiver's city. */
  receiver_city?: string
  /** Receiver's district. */
  receiver_district?: string
  /** Receiver's street/detailed address. */
  receiver_address?: string
  /** Receiver's postal code. */
  receiver_zip_code?: string
  /** Order items (line items). */
  item_list?: RawPddOrderItem[]
  /** Logistics tracking number. */
  tracking_number?: string
  /** Logistics company name. */
  logistics_company_name?: string
  /** Order creation timestamp (Unix seconds). */
  created_time?: number
  /** Order last-modified timestamp (Unix seconds). */
  updated_time?: number
  /** Payment timestamp (Unix seconds). */
  pay_time?: number
  /** Cancellation timestamp (Unix seconds). */
  cancel_time?: number
  /** Confirm receipt timestamp (Unix seconds). */
  confirm_time?: number
  /** Whether order is COD (cash on delivery). */
  cod_status?: number
  /** Buyer's order note/remark. */
  remark?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map a PDD order status code to canonical OrderFinancialStatus.
 */
export function mapFinancialStatus(
  status: number | undefined,
): OrderFinancialStatus | undefined {
  if (status == null) return undefined
  switch (status) {
    case ORDER_STATUS_WAIT_PAY:
      return 'PENDING'
    case ORDER_STATUS_WAIT_DELIVERY:
    case ORDER_STATUS_WAIT_CONFIRM:
    case ORDER_STATUS_FINISHED:
    case ORDER_STATUS_COMPLETED:
      return 'PAID'
    case ORDER_STATUS_CANCELLED:
      return 'VOIDED'
    case ORDER_STATUS_REFUNDING:
      return 'PARTIALLY_REFUNDED'
    default:
      return undefined
  }
}

/**
 * Map a PDD order status code to canonical OrderFulfillmentStatus.
 */
export function mapFulfillmentStatus(
  status: number | undefined,
): OrderFulfillmentStatus | undefined {
  if (status == null) return undefined
  switch (status) {
    case ORDER_STATUS_WAIT_PAY:
    case ORDER_STATUS_WAIT_DELIVERY:
    case ORDER_STATUS_CANCELLED:
    case ORDER_STATUS_REFUNDING:
      return 'UNFULFILLED'
    case ORDER_STATUS_WAIT_CONFIRM:
      return 'PARTIAL'
    case ORDER_STATUS_FINISHED:
    case ORDER_STATUS_COMPLETED:
      return 'FULFILLED'
    default:
      return undefined
  }
}

function buildShippingAddress(raw: RawPddOrder): Address | undefined {
  if (!raw.receiver_address && !raw.receiver_city) return undefined
  return {
    line1: raw.receiver_address ?? undefined,
    city: raw.receiver_city ?? undefined,
    region: raw.receiver_province ?? undefined,
    postalCode: raw.receiver_zip_code ?? undefined,
    country: 'CN',
  }
}

function extractLineItems(raw: RawPddOrder, currency: string): LineItem[] | undefined {
  const items: RawPddOrderItem[] = raw.item_list ?? []
  if (items.length === 0) return undefined

  return items.map((item) => {
    const unitPrice = fenAsMinorUnits(item.goods_price)
    const qty = item.goods_count ?? 1
    return {
      id: item.sub_order_sn ?? String(item.sku_id ?? item.goods_id ?? ''),
      productId: item.goods_id ? String(item.goods_id) : undefined,
      variantId: item.sku_id ? String(item.sku_id) : undefined,
      title: item.goods_name ?? '',
      quantity: qty,
      price: { amount: unitPrice, currency },
      sku:
        item.outer_sku_sn ??
        (item.outer_goods_id ? String(item.outer_goods_id) : undefined),
      metadata: item as unknown as Record<string, unknown>,
    }
  })
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * PDD order → canonical Order.
 *
 * `order_sn` becomes the canonical `id`. Item list becomes line items.
 * The complete raw order object is stored in `metadata`.
 */
export function transformOrder(raw: RawPddOrder, currency = 'CNY'): Order {
  const isCancelled = raw.order_status === ORDER_STATUS_CANCELLED

  const lineItems = extractLineItems(raw, currency)

  // Calculate subtotal from goods_amount (pre-discount) or fall back to order_amount
  const totalDiscounts =
    raw.discount_amount != null && raw.discount_amount > 0
      ? { amount: fenAsMinorUnits(raw.discount_amount), currency }
      : raw.coupon_amount != null && raw.coupon_amount > 0
        ? { amount: fenAsMinorUnits(raw.coupon_amount), currency }
        : undefined

  return {
    id: raw.order_sn ?? String(raw.order_id ?? ''),
    orderNumber: raw.order_sn ?? String(raw.order_id ?? ''),
    currency,
    phone: raw.receiver_phone ?? undefined,
    totalPrice:
      raw.order_amount != null
        ? { amount: fenAsMinorUnits(raw.order_amount), currency }
        : undefined,
    totalShipping:
      raw.freight_amount != null
        ? { amount: fenAsMinorUnits(raw.freight_amount), currency }
        : undefined,
    totalDiscounts,
    financialStatus: mapFinancialStatus(raw.order_status),
    fulfillmentStatus: mapFulfillmentStatus(raw.order_status),
    lineItems: lineItems ?? undefined,
    shippingAddress: buildShippingAddress(raw),
    note: raw.remark ?? undefined,
    createdAt: unixToIso(raw.created_time),
    updatedAt: unixToIso(raw.updated_time),
    processedAt: unixToIso(raw.pay_time),
    cancelledAt: isCancelled ? unixToIso(raw.cancel_time) : undefined,
    cancelReason: isCancelled ? 'CANCELLED' : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
