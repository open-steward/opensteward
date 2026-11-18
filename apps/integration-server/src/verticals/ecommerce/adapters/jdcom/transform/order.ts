/**
 * JD.com order → canonical Order.
 *
 * JD order statuses: WAIT_SELLER_STOCK_OUT (waiting for shipment),
 * WAIT_GOODS_RECEIVE (shipped), FINISHED_L (completed),
 * TRADE_CANCELED (cancelled), LOCKED (locked / under review).
 *
 * JD.com orders use `order_id` as the primary key and prices are in CNY.
 * The search endpoint returns paginated lists; detail endpoint returns
 * full order data with item list.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawJdOrderItem {
  sku_id?: number
  ware_id?: number
  sku_name?: string
  item_total?: number
  jd_price?: number
  gift_point?: number
  outer_sku_id?: string
  [key: string]: unknown
}

export interface RawJdReceiverInfo {
  fullname?: string
  mobile?: string
  telephone?: string
  full_address?: string
  province?: string
  city?: string
  county?: string
  town?: string
  postcode?: string
  [key: string]: unknown
}

export interface RawJdOrder {
  order_id: string
  vender_id?: string
  order_state?: string
  order_total_price?: number
  freight_price?: number
  seller_discount?: number
  order_payment?: number
  item_info_list?: RawJdOrderItem[]
  consignee_info?: RawJdReceiverInfo
  order_start_time?: string
  order_end_time?: string
  modified?: string
  payment_confirm_time?: string
  logistics_id?: string
  waybill?: string
  order_remark?: string
  vender_remark?: string
  [key: string]: unknown
}

export interface RawJdOrderListItem {
  order_id: string
  order_state?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map JD order state to canonical financial status.
 */
export function mapFinancialStatus(
  state: string | undefined,
): OrderFinancialStatus | undefined {
  if (!state) return undefined
  switch (state) {
    case 'WAIT_SELLER_STOCK_OUT':
    case 'WAIT_GOODS_RECEIVE':
    case 'FINISHED_L':
    case 'LOCKED':
      return 'PAID'
    case 'TRADE_CANCELED':
      return 'VOIDED'
    case 'WAIT_SELLER_DELIVERY': // awaiting payment confirmation
      return 'PENDING'
    default:
      return undefined
  }
}

/**
 * Map JD order state to canonical fulfillment status.
 */
export function mapFulfillmentStatus(
  state: string | undefined,
): OrderFulfillmentStatus | undefined {
  if (!state) return undefined
  switch (state) {
    case 'WAIT_SELLER_STOCK_OUT':
    case 'WAIT_SELLER_DELIVERY':
    case 'LOCKED':
      return 'UNFULFILLED'
    case 'WAIT_GOODS_RECEIVE':
      return 'FULFILLED'
    case 'FINISHED_L':
      return 'FULFILLED'
    case 'TRADE_CANCELED':
      return 'UNFULFILLED'
    default:
      return undefined
  }
}

function mapLineItem(raw: RawJdOrderItem, currency: string): LineItem {
  const qty = raw.item_total ?? 1
  const unitPrice = raw.jd_price ?? 0

  return {
    id: raw.sku_id != null ? String(raw.sku_id) : '0',
    productId: raw.ware_id != null ? String(raw.ware_id) : undefined,
    variantId: raw.sku_id != null ? String(raw.sku_id) : undefined,
    title: raw.sku_name ?? 'Unknown item',
    quantity: qty,
    price: { amount: unitPrice, currency },
    sku: raw.outer_sku_id,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function mapShippingAddress(addr: RawJdReceiverInfo | undefined) {
  if (!addr) return undefined
  return {
    line1: addr.full_address ?? undefined,
    city: addr.city ?? undefined,
    region: addr.province ?? undefined,
    postalCode: addr.postcode ?? undefined,
    country: 'CN',
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawJdOrder): Order {
  const currency = 'CNY'
  const lineItems = (raw.item_info_list ?? []).map((li) => mapLineItem(li, currency))
  const isCancelled = raw.order_state === 'TRADE_CANCELED'

  return {
    id: raw.order_id,
    orderNumber: raw.order_id,
    name: raw.order_id,
    currency,
    totalPrice: raw.order_total_price != null
      ? { amount: raw.order_total_price, currency }
      : undefined,
    totalShipping: raw.freight_price != null
      ? { amount: raw.freight_price, currency }
      : undefined,
    totalDiscounts: raw.seller_discount != null
      ? { amount: raw.seller_discount, currency }
      : undefined,
    financialStatus: mapFinancialStatus(raw.order_state),
    fulfillmentStatus: mapFulfillmentStatus(raw.order_state),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippingAddress: mapShippingAddress(raw.consignee_info),
    note: raw.order_remark ?? raw.vender_remark,
    createdAt: raw.order_start_time
      ? new Date(raw.order_start_time).toISOString()
      : undefined,
    updatedAt: raw.modified
      ? new Date(raw.modified).toISOString()
      : undefined,
    processedAt: raw.payment_confirm_time
      ? new Date(raw.payment_confirm_time).toISOString()
      : undefined,
    cancelledAt: isCancelled && raw.modified
      ? new Date(raw.modified).toISOString()
      : undefined,
    cancelReason: isCancelled ? 'Cancelled' : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
