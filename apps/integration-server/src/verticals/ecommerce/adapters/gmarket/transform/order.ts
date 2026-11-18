/**
 * Gmarket Order → canonical Order.
 *
 * Gmarket's seller API returns orders with a `orderNo` primary key,
 * line items, pricing, and payment/fulfillment status.
 *
 * Money amounts are numeric (KRW is zero-decimal).
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawGmarketLineItem {
  orderItemNo: string
  goodsNo?: string
  goodsName?: string
  sellerItemCode?: string
  quantity: number
  itemPrice?: number
  deliveryFee?: number
  discountAmount?: number
  [key: string]: unknown
}

export interface RawGmarketAddress {
  receiverName?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  province?: string
  zipCode?: string
  country?: string
  phone?: string
}

export interface RawGmarketOrder {
  orderNo: string
  buyerId?: string
  orderDate?: string
  modifyDate?: string
  paymentStatus?: string
  deliveryStatus?: string
  totalAmount?: number
  deliveryFee?: number
  discountAmount?: number
  currency?: string
  lineItems?: RawGmarketLineItem[]
  shippingAddress?: RawGmarketAddress
  buyerName?: string
  buyerEmail?: string
  buyerPhone?: string
  cancelDate?: string
  cancelReason?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(amount: number | undefined, currency: string):
  | { amount: number; currency: string }
  | undefined {
  if (amount == null) return undefined
  return { amount, currency }
}

/**
 * Gmarket paymentStatus → canonical financial status.
 * Values: PAID, WAITING, CANCEL, REFUND, PARTIAL_REFUND
 */
export function mapFinancialStatus(
  status: string | undefined,
): OrderFinancialStatus | undefined {
  if (!status) return undefined
  switch (status) {
    case 'PAID':
      return 'PAID'
    case 'WAITING':
      return 'PENDING'
    case 'CANCEL':
      return 'VOIDED'
    case 'REFUND':
      return 'REFUNDED'
    case 'PARTIAL_REFUND':
      return 'PARTIALLY_REFUNDED'
    default:
      return undefined
  }
}

/**
 * Gmarket deliveryStatus → canonical fulfillment status.
 * Values: READY, SHIPPING, DELIVERED, CANCEL
 */
export function mapFulfillmentStatus(
  status: string | undefined,
): OrderFulfillmentStatus | undefined {
  if (!status) return undefined
  switch (status) {
    case 'DELIVERED':
      return 'FULFILLED'
    case 'SHIPPING':
      return 'PARTIAL'
    case 'READY':
      return 'UNFULFILLED'
    case 'CANCEL':
      return 'RESTOCKED'
    default:
      return undefined
  }
}

function mapLineItem(raw: RawGmarketLineItem, currency: string): LineItem {
  const unitPrice = raw.itemPrice ?? 0

  return {
    id: raw.orderItemNo,
    productId: raw.goodsNo,
    title: raw.goodsName ?? raw.sellerItemCode ?? raw.orderItemNo,
    quantity: raw.quantity || 1,
    price: { amount: unitPrice, currency },
    sku: raw.sellerItemCode ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function mapAddress(raw: RawGmarketAddress | undefined) {
  if (!raw) return undefined
  return {
    line1: raw.addressLine1,
    line2: raw.addressLine2,
    city: raw.city,
    region: raw.province,
    postalCode: raw.zipCode,
    country: raw.country,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawGmarketOrder): Order {
  const currency = raw.currency ?? 'KRW'
  const lineItems = (raw.lineItems ?? []).map((li) => mapLineItem(li, currency))

  const subtotal = raw.totalAmount != null && raw.deliveryFee != null
    ? raw.totalAmount - raw.deliveryFee
    : raw.totalAmount

  return {
    id: raw.orderNo,
    orderNumber: raw.orderNo,
    customerId: raw.buyerId,
    email: raw.buyerEmail,
    phone: raw.buyerPhone,
    currency,
    totalPrice: toMoney(raw.totalAmount, currency),
    subtotalPrice: toMoney(subtotal, currency),
    totalShipping: toMoney(raw.deliveryFee, currency),
    totalDiscounts: toMoney(raw.discountAmount, currency),
    financialStatus: mapFinancialStatus(raw.paymentStatus),
    fulfillmentStatus: mapFulfillmentStatus(raw.deliveryStatus),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippingAddress: mapAddress(raw.shippingAddress),
    createdAt: raw.orderDate,
    updatedAt: raw.modifyDate,
    processedAt: raw.orderDate,
    cancelledAt: raw.cancelDate,
    cancelReason: raw.cancelReason,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
