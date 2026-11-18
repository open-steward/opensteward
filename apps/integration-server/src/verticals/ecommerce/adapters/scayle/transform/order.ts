/**
 * SCAYLE Order → canonical Order.
 *
 * SCAYLE order fields:
 *  - id (int), publicKey / referenceKey, status (e.g. "invoice_completed"),
 *  - currencyCode (ISO 4217), cost: { withTax, withoutTax, tax }
 *    (amounts in minor units — integer cents),
 *  - items[] (OrderItem), address: { billing, shipping } (CustomerAddress),
 *  - customer: { id, email, firstName, lastName },
 *  - payment[], packages[], createdAt, updatedAt
 *
 * Docs: https://scayle.dev/en/api-guides/admin-api
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'

// ── Raw SCAYLE shapes (minimal) ──────────────────────────────────────────────

export interface RawScayleCustomerAddress {
  street?: string | null
  houseNumber?: string | null
  additional?: string | null
  zipCode?: string | null
  city?: string | null
  countryCode?: string | null
  state?: string | null
}

export interface RawScayleOrderItemPrice {
  withTax?: number | null
  withoutTax?: number | null
}

export interface RawScayleOrderItemVariant {
  id?: number | string
  referenceKey?: string
}

export interface RawScayleOrderItemProduct {
  id?: number | string
  referenceKey?: string
}

export interface RawScayleOrderItem {
  id: number | string
  currency?: string
  status?: string | null
  price?: RawScayleOrderItemPrice
  quantity?: number
  variant?: RawScayleOrderItemVariant
  product?: RawScayleOrderItemProduct
  [key: string]: unknown
}

export interface RawScayleOrderCost {
  withTax?: number | null
  withoutTax?: number | null
  tax?: { amount?: number | null }
}

export interface RawScayleOrderAddress {
  billing?: RawScayleCustomerAddress | null
  shipping?: RawScayleCustomerAddress | null
}

export interface RawScayleOrderPayment {
  id?: number | string
  referenceKey?: string
}

export interface RawScayleOrderPackage {
  id?: number | string
  trackingId?: string | null
  shipmentServiceId?: number | string
}

export interface RawScayleOrder {
  id: number | string
  publicKey?: string | null
  referenceKey?: string | null
  status?: string | null
  currencyCode?: string
  cost?: RawScayleOrderCost
  items?: RawScayleOrderItem[]
  address?: RawScayleOrderAddress | null
  customer?: {
    id?: number | string
    email?: string | null
    firstName?: string | null
    lastName?: string | null
  } | null
  payment?: RawScayleOrderPayment[]
  packages?: RawScayleOrderPackage[]
  createdAt?: string
  updatedAt?: string
  confirmedAt?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map SCAYLE order status strings to canonical financial/fulfillment statuses.
 * SCAYLE's status model is OMS-oriented rather than payment-oriented.
 */
const FIN_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  invoice_completed: 'PAID',
  confirmed: 'AUTHORIZED',
  payment_pending: 'PENDING',
  refunded: 'REFUNDED',
  partially_refunded: 'PARTIALLY_REFUNDED',
  cancelled: 'VOIDED',
  canceled: 'VOIDED',
}

const FUL_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  ready_for_delivery: 'UNFULFILLED',
  in_delivery: 'PARTIAL',
  delivered: 'FULFILLED',
  returned: 'RESTOCKED',
}

function mapAddress(raw: RawScayleCustomerAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street
    ? `${raw.street}${raw.houseNumber ? ' ' + raw.houseNumber : ''}`
    : undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zipCode ?? undefined
  const country = raw.countryCode ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.additional ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

function mapLineItem(raw: RawScayleOrderItem, currency: string): LineItem {
  // SCAYLE item prices are already in minor units.
  const unitPrice = raw.price?.withTax ?? 0
  return {
    id: String(raw.id),
    productId: raw.product?.id != null ? String(raw.product.id) : undefined,
    variantId: raw.variant?.id != null ? String(raw.variant.id) : undefined,
    title: raw.variant?.referenceKey ?? raw.product?.referenceKey ?? String(raw.id),
    quantity: raw.quantity ?? 1,
    price: { amount: unitPrice, currency },
    sku: raw.variant?.referenceKey ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawScayleOrder): Order {
  const currency = raw.currencyCode ?? 'EUR'
  const status = (raw.status ?? '').toLowerCase()

  // SCAYLE cost values are already in minor units.
  const totalPrice = raw.cost?.withTax != null
    ? { amount: raw.cost.withTax, currency }
    : undefined
  const totalTax = raw.cost?.tax?.amount != null
    ? { amount: raw.cost.tax.amount, currency }
    : undefined

  return {
    id: String(raw.id),
    orderNumber: raw.publicKey ?? raw.referenceKey ?? undefined,
    name: raw.publicKey ?? undefined,
    customerId: raw.customer?.id != null ? String(raw.customer.id) : undefined,
    email: raw.customer?.email ?? undefined,
    currency,
    totalTax,
    totalPrice,
    financialStatus: FIN_STATUS_MAP[status] ?? undefined,
    fulfillmentStatus: FUL_STATUS_MAP[status] ?? undefined,
    lineItems: (raw.items ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.address?.billing),
    shippingAddress: mapAddress(raw.address?.shipping),
    transactionIds: raw.payment?.map((p) => String(p.id ?? p.referenceKey ?? '')).filter(Boolean),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    processedAt: raw.confirmedAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
