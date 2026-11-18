/**
 * Tokopedia order → canonical Order.
 *
 * Tokopedia order statuses use numeric codes:
 *   0 = Seller cancel order
 *   3 = Order Reject Checkout
 *   5 = Order Cancelled by Fraud
 *   6 = Order Rejected (Auto Cancel, Fulfillment)
 *  10 = Order rejected by seller
 *  15 = Instant Cancel by Buyer
 * 100 = Pending (new order)
 * 220 = Payment confirmed / verified
 * 400 = Seller accept order
 * 450 = Waiting for pickup (Tokopedia logistics)
 * 500 = Order shipped
 * 501 = Status changed to shipped due to 3PL update
 * 520 = Invalid shipment ref. number (AWB)
 * 530 = AWB invalid / rejected
 * 540 = Delivered to pickup point
 * 550 = Return to seller
 * 600 = Order delivered
 * 601 = Buyer open case / complaint
 * 690 = Buyer close complaint
 * 691 = Finished (complaint finished)
 * 700 = Order completed
 *
 * Docs: https://developer.tokopedia.com/openapi/guide/#/order
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawTokopediaOrderProduct {
  id?: number
  name?: string
  sku?: string
  quantity?: number
  price?: number
  total_price?: number
  weight?: number
  insurance_price?: number
  notes?: string
  currency?: string
  [key: string]: unknown
}

export interface RawTokopediaRecipient {
  name?: string
  phone?: string
  address?: {
    address_full?: string
    city?: string
    district?: string
    province?: string
    postal_code?: string
    country?: string
    geo?: string
  }
  [key: string]: unknown
}

export interface RawTokopediaShipmentInfo {
  sp_id?: number
  shipping_id?: number
  logistic_name?: string
  logistic_service?: string
  shipping_price?: number
  insurance_price?: number
  awb?: string
  [key: string]: unknown
}

export interface RawTokopediaOrder {
  order_id?: number
  invoice_ref_num?: string
  order_status?: number
  buyer_id?: number
  buyer?: {
    id?: number
    name?: string
    email?: string
    phone?: string
  }
  products?: RawTokopediaOrderProduct[]
  recipient?: RawTokopediaRecipient
  shipment_fulfillment?: RawTokopediaShipmentInfo
  amt?: {
    ttl_product_price?: number
    shipping_cost?: number
    insurance_cost?: number
    total_amount?: number
    discount?: number
    ttl_amount?: number
  }
  payment?: {
    payment_ref_num?: string
    payment_date?: string
    payment_method?: string
  }
  create_time?: string
  update_time?: string
  payment_date?: string
  accept_partial?: boolean
  shop_id?: number
  warehouse_id?: number
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map Tokopedia numeric order status to canonical financial status.
 */
export function mapFinancialStatus(
  status: number | undefined,
): OrderFinancialStatus | undefined {
  if (status == null) return undefined
  if (status < 100) return 'VOIDED' // All cancellation codes
  if (status >= 100 && status < 220) return 'PENDING'
  if (status >= 220) return 'PAID'
  return undefined
}

/**
 * Map Tokopedia numeric order status to canonical fulfillment status.
 */
export function mapFulfillmentStatus(
  status: number | undefined,
): OrderFulfillmentStatus | undefined {
  if (status == null) return undefined
  if (status < 100) return 'UNFULFILLED' // Cancelled
  if (status >= 100 && status < 500) return 'UNFULFILLED'
  if (status >= 500 && status < 600) return 'PARTIAL'
  if (status >= 600) return 'FULFILLED'
  return undefined
}

function mapLineItem(raw: RawTokopediaOrderProduct, fallbackCurrency: string): LineItem {
  const qty = raw.quantity ?? 1
  const unitPrice = raw.price ?? 0
  const currency = raw.currency ?? fallbackCurrency

  return {
    id: raw.id != null ? String(raw.id) : '0',
    productId: raw.id != null ? String(raw.id) : undefined,
    title: raw.name ?? 'Unknown item',
    quantity: qty,
    price: { amount: unitPrice, currency },
    sku: raw.sku,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function mapShippingAddress(recipient: RawTokopediaRecipient | undefined) {
  if (!recipient?.address) return undefined
  const addr = recipient.address
  return {
    line1: addr.address_full ?? undefined,
    city: addr.city ?? addr.district ?? undefined,
    region: addr.province ?? undefined,
    postalCode: addr.postal_code ?? undefined,
    country: addr.country ?? 'ID',
  }
}

/**
 * Check if a Tokopedia order status represents cancellation.
 */
function isCancelled(status: number | undefined): boolean {
  if (status == null) return false
  return status < 100
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawTokopediaOrder): Order {
  const currency = 'IDR'
  const lineItems = (raw.products ?? []).map((li) => mapLineItem(li, currency))
  const cancelled = isCancelled(raw.order_status)

  return {
    id: raw.order_id != null ? String(raw.order_id) : raw.invoice_ref_num ?? '0',
    orderNumber: raw.invoice_ref_num,
    name: raw.invoice_ref_num,
    currency,
    totalPrice: raw.amt?.ttl_amount != null
      ? { amount: raw.amt.ttl_amount, currency }
      : undefined,
    totalShipping: raw.amt?.shipping_cost != null
      ? { amount: raw.amt.shipping_cost, currency }
      : undefined,
    totalDiscounts: raw.amt?.discount != null && raw.amt.discount > 0
      ? { amount: raw.amt.discount, currency }
      : undefined,
    financialStatus: mapFinancialStatus(raw.order_status),
    fulfillmentStatus: mapFulfillmentStatus(raw.order_status),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippingAddress: mapShippingAddress(raw.recipient),
    note: raw.products?.[0]?.notes,
    createdAt: toIsoDatetime(raw.create_time),
    updatedAt: toIsoDatetime(raw.update_time),
    processedAt: toIsoDatetime(raw.payment_date ?? raw.payment?.payment_date),
    cancelledAt: cancelled && raw.update_time ? raw.update_time : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
