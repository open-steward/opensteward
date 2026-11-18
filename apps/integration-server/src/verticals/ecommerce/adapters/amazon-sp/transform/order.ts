/**
 * Amazon SP-API Order → canonical Order.
 *
 * Amazon's Orders API returns two related resources:
 *
 *   GET /orders/v0/orders                     → list of order envelopes
 *   GET /orders/v0/orders/{id}                → full order envelope
 *   GET /orders/v0/orders/{id}/orderItems     → line items for that order
 *
 * The list envelope contains order-level totals but no line items; the
 * adapter's `getOrder` fetches both and merges them through this
 * transform.
 *
 * **PII handling**: Amazon's default data release does NOT include buyer
 * email / name / shipping address. Retrieving buyer info requires a
 * Restricted Data Token (RDT) and explicit data-use declarations, which
 * v1 intentionally skips. The transform **never** copies buyer PII
 * fields onto the canonical order — `customerId`, `email`, `phone`,
 * `billingAddress`, `shippingAddress` are always `undefined` even if
 * the caller passes a payload that happens to contain them.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawAmazonMoney {
  CurrencyCode: string
  Amount: string
}

export interface RawAmazonOrderItem {
  ASIN: string
  SellerSKU?: string
  OrderItemId: string
  Title?: string
  QuantityOrdered: number
  QuantityShipped?: number
  ItemPrice?: RawAmazonMoney
  ItemTax?: RawAmazonMoney
  ShippingPrice?: RawAmazonMoney
  PromotionDiscount?: RawAmazonMoney
  ProductInfo?: { NumberOfItems?: string }
  [key: string]: unknown
}

export interface RawAmazonOrder {
  AmazonOrderId: string
  SellerOrderId?: string
  PurchaseDate?: string
  LastUpdateDate?: string
  OrderStatus?: string
  FulfillmentChannel?: 'MFN' | 'AFN'
  SalesChannel?: string
  NumberOfItemsShipped?: number
  NumberOfItemsUnshipped?: number
  OrderType?: string
  EarliestShipDate?: string
  LatestShipDate?: string
  MarketplaceId?: string
  ShipmentServiceLevelCategory?: string
  OrderTotal?: RawAmazonMoney
  PaymentMethod?: string
  IsPremiumOrder?: boolean
  IsPrime?: boolean
  IsBusinessOrder?: boolean
  IsReplacementOrder?: boolean
  /** Internal hydration slot — populated by the adapter when it fetches order items. */
  OrderItems?: RawAmazonOrderItem[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(m: RawAmazonMoney | undefined):
  | { amount: number; currency: string }
  | undefined {
  if (!m) return undefined
  const n = parseFloat(m.Amount)
  if (Number.isNaN(n)) return undefined
  return { amount: majorToMinor(n, m.CurrencyCode), currency: m.CurrencyCode }
}

/**
 * Amazon order status → canonical fulfillment status.
 *
 * Amazon's OrderStatus combines fulfillment *and* business-process state
 * in a single enum. We split the fulfillment aspect onto
 * `fulfillmentStatus` and the financial aspect onto `financialStatus`
 * via {@link mapFinancialStatus}.
 */
export function mapFulfillmentStatus(
  status: string | undefined,
): OrderFulfillmentStatus | undefined {
  if (!status) return undefined
  switch (status) {
    case 'Shipped':
      return 'FULFILLED'
    case 'PartiallyShipped':
      return 'PARTIAL'
    case 'Unshipped':
    case 'Pending':
    case 'InvoiceUnconfirmed':
    case 'Canceled':
      return 'UNFULFILLED'
    default:
      return undefined
  }
}

/**
 * Amazon order status → canonical financial status. Amazon doesn't
 * expose a separate `financial_status` the way Shopify does, so we
 * infer it from the order-level status.
 */
export function mapFinancialStatus(
  status: string | undefined,
): OrderFinancialStatus | undefined {
  if (!status) return undefined
  switch (status) {
    case 'Shipped':
      return 'PAID'
    case 'PartiallyShipped':
      return 'PARTIALLY_PAID'
    case 'PendingAvailability':
    case 'Pending':
    case 'Unshipped':
      return 'PENDING'
    case 'Canceled':
      return 'VOIDED'
    default:
      return undefined
  }
}

function mapLineItem(raw: RawAmazonOrderItem, currency: string): LineItem {
  const price = toMoney(raw.ItemPrice)
  // Amazon returns ItemPrice as the *line* total (price × quantity).
  // Canonical price is *unit* price, so divide when quantity > 0.
  const qty = raw.QuantityOrdered || 1
  const unit: { amount: number; currency: string } = price
    ? { amount: Math.round(price.amount / qty), currency: price.currency }
    : { amount: 0, currency }
  return {
    id: raw.OrderItemId,
    // Amazon has no productId / variantId distinction — the SKU is the
    // only seller-side identifier, and the ASIN is the catalog side.
    // Surface both: SKU in canonical `sku`, ASIN in `metadata`.
    title: raw.Title ?? raw.SellerSKU ?? raw.ASIN,
    quantity: qty,
    price: unit,
    sku: raw.SellerSKU ?? undefined,
    fulfillableQuantity:
      raw.QuantityShipped != null ? Math.max(0, qty - raw.QuantityShipped) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawAmazonOrder): Order {
  const total = toMoney(raw.OrderTotal)
  const currency = total?.currency ?? raw.OrderTotal?.CurrencyCode ?? 'USD'
  const lineItems = (raw.OrderItems ?? []).map((li) => mapLineItem(li, currency))

  return {
    id: raw.AmazonOrderId,
    orderNumber: raw.AmazonOrderId,
    name: raw.SellerOrderId ?? raw.AmazonOrderId,
    // Buyer PII is intentionally omitted — see file header.
    customerId: undefined,
    email: undefined,
    phone: undefined,
    currency,
    totalPrice: total,
    financialStatus: mapFinancialStatus(raw.OrderStatus),
    fulfillmentStatus: mapFulfillmentStatus(raw.OrderStatus),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    billingAddress: undefined,
    shippingAddress: undefined,
    createdAt: raw.PurchaseDate,
    updatedAt: raw.LastUpdateDate,
    processedAt: raw.PurchaseDate,
    cancelledAt: raw.OrderStatus === 'Canceled' ? raw.LastUpdateDate : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
