/**
 * Shopee order → canonical Order.
 *
 * Shopee order statuses are: UNPAID, READY_TO_SHIP, PROCESSED, SHIPPED,
 * COMPLETED, IN_CANCEL, CANCELLED, INVOICE_PENDING.
 *
 * The list endpoint returns order summary (order_sn list), and the
 * detail endpoint returns full order data including items.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawShopeeOrderItem {
  item_id?: number
  item_name?: string
  item_sku?: string
  model_id?: number
  model_quantity_purchased?: number
  model_original_price?: number
  model_discounted_price?: number
  order_item_id?: number
  [key: string]: unknown
}

export interface RawShopeeRecipientAddress {
  name?: string
  phone?: string
  town?: string
  district?: string
  city?: string
  state?: string
  region?: string
  zipcode?: string
  full_address?: string
  country?: string
  [key: string]: unknown
}

export interface RawShopeeOrder {
  order_sn: string
  order_status?: string
  currency?: string
  total_amount?: number
  actual_shipping_fee?: number
  buyer_user_id?: number
  buyer_username?: string
  item_list?: RawShopeeOrderItem[]
  recipient_address?: RawShopeeRecipientAddress
  create_time?: number
  update_time?: number
  pay_time?: number
  ship_by_date?: number
  cancel_reason?: string
  note?: string
  message_to_seller?: string
  [key: string]: unknown
}

export interface RawShopeeOrderListItem {
  order_sn: string
  order_status?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map Shopee order status to canonical financial status.
 */
export function mapFinancialStatus(
  status: string | undefined,
): OrderFinancialStatus | undefined {
  if (!status) return undefined
  switch (status.toUpperCase()) {
    case 'UNPAID':
    case 'INVOICE_PENDING':
      return 'PENDING'
    case 'READY_TO_SHIP':
    case 'PROCESSED':
    case 'SHIPPED':
    case 'COMPLETED':
      return 'PAID'
    case 'IN_CANCEL':
      return 'PAID'
    case 'CANCELLED':
      return 'VOIDED'
    default:
      return undefined
  }
}

/**
 * Map Shopee order status to canonical fulfillment status.
 */
export function mapFulfillmentStatus(
  status: string | undefined,
): OrderFulfillmentStatus | undefined {
  if (!status) return undefined
  switch (status.toUpperCase()) {
    case 'UNPAID':
    case 'INVOICE_PENDING':
    case 'READY_TO_SHIP':
    case 'IN_CANCEL':
      return 'UNFULFILLED'
    case 'PROCESSED':
      return 'PARTIAL'
    case 'SHIPPED':
    case 'COMPLETED':
      return 'FULFILLED'
    case 'CANCELLED':
      return 'UNFULFILLED'
    default:
      return undefined
  }
}

function mapLineItem(raw: RawShopeeOrderItem, currency: string): LineItem {
  const qty = raw.model_quantity_purchased ?? 1
  const unitPrice = raw.model_discounted_price ?? raw.model_original_price ?? 0

  return {
    id: raw.order_item_id != null ? String(raw.order_item_id) : String(raw.item_id ?? '0'),
    productId: raw.item_id != null ? String(raw.item_id) : undefined,
    variantId: raw.model_id != null ? String(raw.model_id) : undefined,
    title: raw.item_name ?? 'Unknown item',
    quantity: qty,
    price: { amount: majorToMinor(unitPrice, currency), currency },
    totalDiscount:
      raw.model_original_price != null &&
      raw.model_discounted_price != null &&
      raw.model_original_price > raw.model_discounted_price
        ? {
            amount: majorToMinor(
              (raw.model_original_price - raw.model_discounted_price) * qty,
              currency,
            ),
            currency,
          }
        : undefined,
    sku: raw.item_sku,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function mapShippingAddress(addr: RawShopeeRecipientAddress | undefined) {
  if (!addr) return undefined
  return {
    line1: addr.full_address ?? undefined,
    city: addr.city ?? addr.town ?? undefined,
    region: addr.state ?? addr.region ?? undefined,
    postalCode: addr.zipcode ?? undefined,
    country: addr.country ?? undefined,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawShopeeOrder): Order {
  const currency = raw.currency ?? 'USD'
  const lineItems = (raw.item_list ?? []).map((li) => mapLineItem(li, currency))
  const isCancelled =
    raw.order_status?.toUpperCase() === 'CANCELLED' ||
    raw.order_status?.toUpperCase() === 'IN_CANCEL'

  return {
    id: raw.order_sn,
    orderNumber: raw.order_sn,
    name: raw.order_sn,
    currency,
    totalPrice: raw.total_amount != null
      ? { amount: majorToMinor(raw.total_amount, currency), currency }
      : undefined,
    totalShipping: raw.actual_shipping_fee != null
      ? { amount: majorToMinor(raw.actual_shipping_fee, currency), currency }
      : undefined,
    financialStatus: mapFinancialStatus(raw.order_status),
    fulfillmentStatus: mapFulfillmentStatus(raw.order_status),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippingAddress: mapShippingAddress(raw.recipient_address),
    note: raw.message_to_seller ?? raw.note,
    createdAt: raw.create_time ? new Date(raw.create_time * 1000).toISOString() : undefined,
    updatedAt: raw.update_time ? new Date(raw.update_time * 1000).toISOString() : undefined,
    processedAt: raw.pay_time ? new Date(raw.pay_time * 1000).toISOString() : undefined,
    cancelledAt: isCancelled && raw.update_time
      ? new Date(raw.update_time * 1000).toISOString()
      : undefined,
    cancelReason: isCancelled ? raw.cancel_reason : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
