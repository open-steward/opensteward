/**
 * Walmart Order → canonical Order.
 *
 * Walmart's Orders API returns marketplace orders with line items (orderLines),
 * pricing, and shipping info.
 *
 * GET /v3/orders → list (paginated)
 * GET /v3/orders/{purchaseOrderId} → get
 *
 * Money amounts in Walmart are plain numbers with a currency field.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawWalmartCharge {
  chargeType?: string
  chargeName?: string
  chargeAmount?: {
    currency?: string
    amount?: number
  }
  tax?: {
    taxName?: string
    taxAmount?: {
      currency?: string
      amount?: number
    }
  }
}

export interface RawWalmartOrderLine {
  lineNumber?: string
  item?: {
    productName?: string
    sku?: string
  }
  charges?: RawWalmartCharge[]
  orderLineQuantity?: {
    unitOfMeasurement?: string
    amount?: string
  }
  statusDate?: string
  orderLineStatuses?: Array<{
    status?: string
    statusQuantity?: {
      unitOfMeasurement?: string
      amount?: string
    }
    trackingInfo?: {
      shipDateTime?: string
      carrierName?: {
        carrier?: string
      }
      trackingNumber?: string
      trackingURL?: string
    }
  }>
  fulfillment?: {
    fulfillmentOption?: string
    shipMethod?: string
  }
  [key: string]: unknown
}

export interface RawWalmartAddress {
  name?: string
  address1?: string
  address2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  phone?: string
  email?: string
}

export interface RawWalmartOrder {
  purchaseOrderId: string
  customerOrderId?: string
  customerEmailId?: string
  orderDate?: string
  estimatedDeliveryDate?: string
  estimatedShipDate?: string
  orderLines?: {
    orderLine?: RawWalmartOrderLine[]
  }
  shippingInfo?: {
    postalAddress?: RawWalmartAddress
    phone?: string
    estimatedDeliveryDate?: string
    estimatedShipDate?: string
    methodCode?: string
  }
  orderSummary?: {
    totalAmount?: { currency?: string; amount?: number }
    orderSubTotal?: { currency?: string; amount?: number }
    shippingAmount?: { currency?: string; amount?: number }
    taxAmount?: { currency?: string; amount?: number }
    discountAmount?: { currency?: string; amount?: number }
  }
  status?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(m: { currency?: string; amount?: number } | undefined):
  | { amount: number; currency: string }
  | undefined {
  if (!m || m.amount == null) return undefined
  const currency = m.currency ?? 'USD'
  return { amount: majorToMinor(m.amount, currency), currency }
}

/**
 * Walmart order status → canonical fulfillment status.
 * Common statuses: Created, Acknowledged, Shipped, Delivered, Cancelled
 */
export function mapFulfillmentStatus(
  status: string | undefined,
): OrderFulfillmentStatus | undefined {
  if (!status) return undefined
  const upper = status.toUpperCase()
  switch (upper) {
    case 'SHIPPED':
    case 'DELIVERED':
      return 'FULFILLED'
    case 'ACKNOWLEDGED':
    case 'CREATED':
      return 'UNFULFILLED'
    default:
      return undefined
  }
}

/**
 * Walmart order status → canonical financial status.
 * Walmart doesn't have a separate payment status — orders are prepaid.
 */
export function mapFinancialStatus(
  status: string | undefined,
): OrderFinancialStatus | undefined {
  if (!status) return undefined
  const upper = status.toUpperCase()
  switch (upper) {
    case 'SHIPPED':
    case 'DELIVERED':
    case 'ACKNOWLEDGED':
      return 'PAID'
    case 'CREATED':
      return 'PENDING'
    case 'CANCELLED':
      return 'VOIDED'
    case 'REFUND':
      return 'REFUNDED'
    default:
      return 'PAID'
  }
}

function mapLineItem(raw: RawWalmartOrderLine, currency: string): LineItem {
  const qty = raw.orderLineQuantity?.amount ? parseInt(raw.orderLineQuantity.amount, 10) : 1
  const productCharge = raw.charges?.find(
    (c) => c.chargeType === 'PRODUCT' || c.chargeName === 'ItemPrice',
  )
  const lineTotal = productCharge?.chargeAmount?.amount ?? 0
  const lineCurrency = productCharge?.chargeAmount?.currency ?? currency
  const unitPrice = qty > 0 ? lineTotal / qty : 0

  return {
    id: raw.lineNumber ?? '0',
    title: raw.item?.productName ?? raw.item?.sku ?? raw.lineNumber ?? 'Unknown',
    quantity: qty,
    price: { amount: majorToMinor(unitPrice, lineCurrency), currency: lineCurrency },
    sku: raw.item?.sku,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function mapAddress(raw: RawWalmartAddress | undefined) {
  if (!raw) return undefined
  return {
    line1: raw.address1,
    line2: raw.address2,
    city: raw.city,
    region: raw.state,
    postalCode: raw.postalCode,
    country: raw.country,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawWalmartOrder): Order {
  const total = toMoney(raw.orderSummary?.totalAmount)
  const currency = total?.currency ?? 'USD'
  const lines = raw.orderLines?.orderLine ?? []
  const lineItems = lines.map((li) => mapLineItem(li, currency))

  const isCancelled = raw.status?.toUpperCase() === 'CANCELLED'

  return {
    id: raw.purchaseOrderId,
    orderNumber: raw.customerOrderId ?? raw.purchaseOrderId,
    name: raw.purchaseOrderId,
    email: raw.customerEmailId,
    currency,
    totalPrice: total,
    subtotalPrice: toMoney(raw.orderSummary?.orderSubTotal),
    totalTax: toMoney(raw.orderSummary?.taxAmount),
    totalShipping: toMoney(raw.orderSummary?.shippingAmount),
    totalDiscounts: toMoney(raw.orderSummary?.discountAmount),
    financialStatus: mapFinancialStatus(raw.status),
    fulfillmentStatus: mapFulfillmentStatus(raw.status),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippingAddress: mapAddress(raw.shippingInfo?.postalAddress),
    createdAt: raw.orderDate,
    updatedAt: raw.orderDate,
    processedAt: raw.orderDate,
    cancelledAt: isCancelled ? raw.orderDate : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
