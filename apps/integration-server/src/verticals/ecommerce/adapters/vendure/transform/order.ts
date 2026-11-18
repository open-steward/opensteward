/**
 * Vendure Order -> canonical Order.
 *
 * Maps Vendure's order state machine to canonical `financialStatus` +
 * `fulfillmentStatus` pairs.
 *
 * Vendure states: AddingItems, ArrangingPayment, PaymentAuthorized,
 * PaymentSettled, PartiallyShipped, Shipped, PartiallyDelivered,
 * Delivered, Cancelled.
 *
 * Prices are integers in cents -- canonical Money.amount is also integer cents.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'

// -- Raw shapes --------------------------------------------------------------

export interface RawVendureOrderAddress {
  streetLine1?: string | null
  streetLine2?: string | null
  city?: string | null
  province?: string | null
  postalCode?: string | null
  country?: string | null
  countryCode?: string | null
  phoneNumber?: string | null
}

export interface RawVendureOrderLine {
  id: string
  productVariant?: { id?: string; name?: string; sku?: string; product?: { id?: string } } | null
  quantity: number
  unitPrice?: number // cents
  unitPriceWithTax?: number
  linePrice?: number
  linePriceWithTax?: number
  [key: string]: unknown
}

export interface RawVendureOrder {
  id: string
  code?: string
  state?: string
  orderPlacedAt?: string | null
  customer?: { id?: string; emailAddress?: string } | null
  currencyCode?: string
  subTotal?: number // cents
  subTotalWithTax?: number
  shipping?: number // cents
  shippingWithTax?: number
  total?: number // cents
  totalWithTax?: number
  lines?: RawVendureOrderLine[]
  shippingAddress?: RawVendureOrderAddress | null
  billingAddress?: RawVendureOrderAddress | null
  fulfillments?: Array<{ id: string; state?: string; trackingCode?: string }> | null
  couponCodes?: string[] | null
  payments?: Array<{ id: string; method?: string; amount?: number; state?: string }> | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// -- Status mapping ----------------------------------------------------------

interface StatusPair {
  financial: OrderFinancialStatus
  fulfillment: OrderFulfillmentStatus
}

const STATUS_MAP: Record<string, StatusPair> = {
  ADDINGITEMS: { financial: 'PENDING', fulfillment: 'UNFULFILLED' },
  ARRANGINGPAYMENT: { financial: 'PENDING', fulfillment: 'UNFULFILLED' },
  PAYMENTAUTHORIZED: { financial: 'AUTHORIZED', fulfillment: 'UNFULFILLED' },
  PAYMENTSETTLED: { financial: 'PAID', fulfillment: 'UNFULFILLED' },
  PARTIALLYSHIPPED: { financial: 'PAID', fulfillment: 'PARTIAL' },
  SHIPPED: { financial: 'PAID', fulfillment: 'FULFILLED' },
  PARTIALLYDELIVERED: { financial: 'PAID', fulfillment: 'PARTIAL' },
  DELIVERED: { financial: 'PAID', fulfillment: 'FULFILLED' },
  CANCELLED: { financial: 'VOIDED', fulfillment: 'UNFULFILLED' },
}

// -- Helpers -----------------------------------------------------------------

function mapAddress(raw: RawVendureOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.streetLine1 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.postalCode ?? undefined
  const country = raw.countryCode ?? raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.streetLine2 ?? undefined,
    city,
    region: raw.province ?? undefined,
    postalCode,
    country,
  }
}

function centsToAmount(cents: number | undefined): number {
  // Vendure stores money as integer minor units (cents), which is exactly the
  // canonical Money.amount representation. Pass the integer through.
  return cents != null ? Math.round(cents) : 0
}

function mapLineItem(raw: RawVendureOrderLine, currency: string): LineItem {
  const unitAmount = centsToAmount(raw.unitPriceWithTax ?? raw.unitPrice)
  return {
    id: String(raw.id),
    productId: raw.productVariant?.product?.id != null ? String(raw.productVariant.product.id) : undefined,
    variantId: raw.productVariant?.id != null ? String(raw.productVariant.id) : undefined,
    title: raw.productVariant?.name ?? '',
    quantity: raw.quantity,
    price: { amount: unitAmount, currency },
    sku: raw.productVariant?.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// -- Transform ---------------------------------------------------------------

export function transformOrder(raw: RawVendureOrder): Order {
  const currency = raw.currencyCode ?? 'USD'
  const stateKey = raw.state ? raw.state.toUpperCase().replace(/_/g, '') : undefined
  const status = stateKey ? STATUS_MAP[stateKey] : undefined

  return {
    id: String(raw.id),
    orderNumber: raw.code ?? undefined,
    customerId: raw.customer?.id != null ? String(raw.customer.id) : undefined,
    email: raw.customer?.emailAddress ?? undefined,
    currency,
    subtotalPrice: raw.subTotalWithTax != null || raw.subTotal != null
      ? { amount: centsToAmount(raw.subTotalWithTax ?? raw.subTotal), currency }
      : undefined,
    totalShipping: raw.shippingWithTax != null || raw.shipping != null
      ? { amount: centsToAmount(raw.shippingWithTax ?? raw.shipping), currency }
      : undefined,
    totalPrice: raw.totalWithTax != null || raw.total != null
      ? { amount: centsToAmount(raw.totalWithTax ?? raw.total), currency }
      : undefined,
    financialStatus: status?.financial,
    fulfillmentStatus: status?.fulfillment,
    lineItems: (raw.lines ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: mapAddress(raw.shippingAddress),
    fulfillmentIds: raw.fulfillments?.map((f) => String(f.id)),
    discountCodes: raw.couponCodes && raw.couponCodes.length > 0 ? raw.couponCodes : undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    // Vendure order creation uses addItemToOrder mutations, not a single input
    // This provides the basic fields for draft order creation
    customerId: order.customerId,
    couponCodes: order.discountCodes,
  }
}
