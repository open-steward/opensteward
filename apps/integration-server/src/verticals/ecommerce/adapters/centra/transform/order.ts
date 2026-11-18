/**
 * Centra Order API Order → canonical Order.
 *
 * Centra GET /orders response fields:
 *  - `orderId`, `selectionId`, `orderDate`, `orderStatus`
 *  - `customerId`
 *  - `deliveryName`, `deliveryAddress`, `deliveryCity`, `deliveryZip`,
 *    `deliveryCountry`, `deliveryState`  — shipping address
 *  - `billingName`, `billingAddress`, `billingCity`, `billingZip`,
 *    `billingCountry`, `billingState`    — billing address
 *  - `email`, `phoneNumber`
 *  - `currency`, `baseCurrency`, `baseCurrencyRate`
 *  - `shippingValue`, `voucherValue`, `grandTotalValue`, `grandTotalTaxValue`
 *  - `products[]` — line items: lineId, qty, sku, name, variant, size, price
 *  - `taxBreakdown[]` — [{description, taxPercent, value}]
 *  - `shipments[]`    — [{shipmentId, …}]
 *
 * Docs: https://centra.dev/docs/apis/order-api/api-reference
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawCentraOrderLineItem {
  lineId: number | string
  qty: number
  sku?: string | null
  variantSku?: string | null
  productId?: number | string | null
  variantId?: number | string | null
  stockItemId?: number | string | null
  name?: string
  variant?: string | null
  size?: string | null
  price?: string | number
  originalPrice?: string | number
  [key: string]: unknown
}

export interface RawCentraOrderShipment {
  shipmentId: number | string
  [key: string]: unknown
}

export interface RawCentraOrder {
  orderId: number | string
  selectionId?: string
  orderDate?: string
  orderStatus?: string | null
  customerId?: number | string | null
  email?: string | null
  phoneNumber?: string | null
  currency?: string
  baseCurrency?: string
  shippingValue?: string | number
  voucherValue?: string | number
  grandTotalValue?: string | number
  grandTotalTaxValue?: string | number

  /** Shipping / delivery address */
  deliveryName?: string | null
  deliveryAddress?: string | null
  deliveryAddress2?: string | null
  deliveryCity?: string | null
  deliveryZip?: string | null
  deliveryState?: string | null
  deliveryCountry?: string | null

  /** Billing address */
  billingName?: string | null
  billingAddress?: string | null
  billingAddress2?: string | null
  billingCity?: string | null
  billingZip?: string | null
  billingState?: string | null
  billingCountry?: string | null

  products?: RawCentraOrderLineItem[]
  shipments?: RawCentraOrderShipment[]

  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function toMinor(v: string | number | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

/**
 * Map Centra `orderStatus` to canonical `OrderFinancialStatus`.
 * Centra uses values like: "untouched", "pending", "paid", "cancelled".
 * Keys must match Centra's exact casing — do NOT lowercase before lookup.
 */
const FIN_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  untouched: 'PENDING',
  pending: 'PENDING',
  confirmed: 'AUTHORIZED',
  processing: 'AUTHORIZED',
  paid: 'PAID',
  partiallyPaid: 'PARTIALLY_PAID',
  refunded: 'REFUNDED',
  partialRefund: 'PARTIALLY_REFUNDED',
  cancelled: 'VOIDED',
  canceled: 'VOIDED',
}

/**
 * Derive fulfillment status from shipments presence.
 */
function mapFulfillmentStatus(
  shipments: RawCentraOrderShipment[] | undefined,
): OrderFulfillmentStatus | undefined {
  if (!shipments || shipments.length === 0) return 'UNFULFILLED'
  return 'FULFILLED'
}

function mapDeliveryAddress(raw: RawCentraOrder): Address | undefined {
  const line1 = raw.deliveryAddress ?? undefined
  const line2 = raw.deliveryAddress2 ?? undefined
  const city = raw.deliveryCity ?? undefined
  const region = raw.deliveryState ?? undefined
  const postalCode = raw.deliveryZip ?? undefined
  const country = raw.deliveryCountry ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapBillingAddress(raw: RawCentraOrder): Address | undefined {
  const line1 = raw.billingAddress ?? undefined
  const line2 = raw.billingAddress2 ?? undefined
  const city = raw.billingCity ?? undefined
  const region = raw.billingState ?? undefined
  const postalCode = raw.billingZip ?? undefined
  const country = raw.billingCountry ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapLineItem(raw: RawCentraOrderLineItem, currency: string): LineItem {
  const titleParts = [raw.name, raw.variant, raw.size].filter(Boolean)
  return {
    id: String(raw.lineId),
    productId: raw.productId != null ? String(raw.productId) : undefined,
    variantId: raw.stockItemId != null ? String(raw.stockItemId) : (raw.variantId != null ? String(raw.variantId) : undefined),
    title: titleParts.join(' / ') || String(raw.lineId),
    quantity: raw.qty,
    price: { amount: toMinor(raw.price, currency), currency },
    sku: raw.sku ?? raw.variantSku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawCentraOrder): Order {
  const currency = raw.currency ?? 'USD'
  const money = (v: string | number | null | undefined) =>
    ({ amount: toMinor(v, currency), currency })

  const orderStatus = raw.orderStatus ?? ''

  return {
    id: String(raw.orderId),
    orderNumber: raw.selectionId || undefined,
    customerId: raw.customerId != null ? String(raw.customerId) : undefined,
    email: raw.email ?? undefined,
    phone: raw.phoneNumber ?? undefined,
    currency,
    totalShipping: raw.shippingValue != null ? money(raw.shippingValue) : undefined,
    totalDiscounts: raw.voucherValue != null ? money(raw.voucherValue) : undefined,
    totalTax: raw.grandTotalTaxValue != null ? money(raw.grandTotalTaxValue) : undefined,
    totalPrice: raw.grandTotalValue != null ? money(raw.grandTotalValue) : undefined,
    financialStatus: FIN_STATUS_MAP[orderStatus] ?? undefined,
    fulfillmentStatus: mapFulfillmentStatus(raw.shipments),
    lineItems: (raw.products ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapBillingAddress(raw),
    shippingAddress: mapDeliveryAddress(raw),
    fulfillmentIds: raw.shipments?.map((s) => String(s.shipmentId)),
    createdAt: toIsoDatetime(raw.orderDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Centra order body (for create). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: order.email,
    currency: order.currency,
  }

  if (order.shippingAddress) {
    const a = order.shippingAddress
    body.deliveryName = [order.lineItems?.[0]?.title].filter(Boolean).join(' ')
    body.deliveryAddress = a.line1
    body.deliveryAddress2 = a.line2
    body.deliveryCity = a.city
    body.deliveryZip = a.postalCode
    body.deliveryState = a.region
    body.deliveryCountry = a.country
  }

  if (order.lineItems) {
    body.products = order.lineItems.map((li) => ({
      qty: li.quantity,
      sku: li.sku,
      comment: li.title,
    }))
  }

  return body
}
