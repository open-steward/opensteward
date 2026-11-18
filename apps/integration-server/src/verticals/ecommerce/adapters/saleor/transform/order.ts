/**
 * Saleor Order → canonical Order.
 *
 * Fields per docs.saleor.io/api-reference/orders/objects/order. `total`,
 * `subtotal`, `shippingPrice` and each line's `unitPrice` are `TaxedMoney!`,
 * whose `gross` is `Money!` ("currency: String!", "amount: Float!"), so every
 * amount carries its own currency and none is defaulted.
 *
 * `status` (OrderStatus) is a fulfilment lifecycle; only its three fulfilment
 * values map to `fulfillmentStatus`. It says nothing about payment, so
 * `financialStatus` is not derived from it.
 */

import type { Order, LineItem, OrderFulfillmentStatus } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ──────────────────────────────────────────────────────────────

export interface RawSaleorOrderAddress {
  streetAddress1?: string | null
  streetAddress2?: string | null
  city?: string | null
  countryArea?: string | null
  postalCode?: string | null
  country?: { code?: string } | null
}

/** Saleor `TaxedMoney`, as selected: its gross `Money`. */
export interface RawSaleorTaxedMoney {
  gross: { amount: number; currency: string }
}

export interface RawSaleorOrderLine {
  id: string
  productName: string
  variantName?: string
  productSku?: string | null
  quantity: number
  unitPrice: RawSaleorTaxedMoney
  variant?: { id?: string; product?: { id?: string } } | null
  [key: string]: unknown
}

export interface RawSaleorOrder {
  id: string
  number?: string | number
  status?: string
  user?: { id?: string; email?: string } | null
  userEmail?: string | null
  billingAddress?: RawSaleorOrderAddress | null
  shippingAddress?: RawSaleorOrderAddress | null
  total: RawSaleorTaxedMoney
  subtotal?: RawSaleorTaxedMoney | null
  shippingPrice?: RawSaleorTaxedMoney | null
  lines?: RawSaleorOrderLine[]
  fulfillments?: Array<{ id: string; status?: string; trackingNumber?: string }> | null
  voucherCode?: string | null
  created?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Status mapping ──────────────────────────────────────────────────────────

/** OrderStatus values that name a fulfilment state; the rest do not. */
const FULFILLMENT_STATUS: Record<string, OrderFulfillmentStatus> = {
  UNFULFILLED: 'UNFULFILLED',
  PARTIALLY_FULFILLED: 'PARTIAL',
  FULFILLED: 'FULFILLED',
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapAddress(raw: RawSaleorOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  // Address's text fields are `String!` and come back '' when unset.
  const line1 = raw.streetAddress1 || undefined
  const city = raw.city || undefined
  const postalCode = raw.postalCode || undefined
  const country = raw.country?.code || undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.streetAddress2 || undefined,
    city,
    region: raw.countryArea || undefined,
    postalCode,
    country,
  }
}

function money(raw: RawSaleorTaxedMoney): { amount: number; currency: string } {
  return {
    amount: majorToMinor(raw.gross.amount, raw.gross.currency),
    currency: raw.gross.currency,
  }
}

function mapLineItem(raw: RawSaleorOrderLine): LineItem {
  return {
    id: raw.id,
    productId: raw.variant?.product?.id ?? undefined,
    variantId: raw.variant?.id ?? undefined,
    title: raw.productName,
    quantity: raw.quantity,
    price: money(raw.unitPrice),
    sku: raw.productSku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformOrder(raw: RawSaleorOrder): Order {
  return {
    id: raw.id,
    orderNumber: raw.number != null ? String(raw.number) : undefined,
    customerId: raw.user?.id ?? undefined,
    email: raw.userEmail || undefined,
    currency: raw.total.gross.currency,
    subtotalPrice: raw.subtotal ? money(raw.subtotal) : undefined,
    totalShipping: raw.shippingPrice ? money(raw.shippingPrice) : undefined,
    totalPrice: money(raw.total),
    fulfillmentStatus: raw.status ? FULFILLMENT_STATUS[raw.status] : undefined,
    lineItems: (raw.lines ?? []).map(mapLineItem),
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: mapAddress(raw.shippingAddress),
    fulfillmentIds: raw.fulfillments?.map((f) => f.id),
    discountCodes: raw.voucherCode ? [raw.voucherCode] : undefined,
    createdAt: raw.created,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    userEmail: order.email,
    lines: order.lineItems?.map((li) => ({
      variantId: li.variantId,
      quantity: li.quantity,
    })),
  }
}
