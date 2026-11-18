/**
 * ColorMe Shop Sale → canonical Order.
 *
 * Docs: OpenAPI spec paths["/v1/sales"]. ColorMe models order state as three
 * independent booleans (`paid`, `delivered`, `canceled`), not a rich
 * financial/fulfillment status enum — mapped onto the closest canonical
 * values (`PAID`/`PENDING`, `FULFILLED`/`UNFULFILLED`) rather than
 * inventing intermediate states the platform doesn't report.
 *
 * `createOrder` is not implemented: the documented request body
 * (`POST /v1/sales`) needs a numeric prefecture code (`pref_id`) and a
 * `payment_id` that have no source on the canonical Order/Address shape, and
 * is Premium-plan-only — mapping it would mean inventing a
 * region-string → pref_id lookup this task's rules forbid.
 */

import type { Order, LineItem } from '../../../schema/order'
import type { Address } from '../../../schema/shared'

const CURRENCY = 'JPY'

export interface RawColormeSaleDetail {
  id: number
  product_id?: number
  product_model_number?: string | null
  product_name: string
  price: number
  product_num: number
}

export interface RawColormeSaleDelivery {
  name?: string
  postal?: string | null
  pref_name?: string
  address1?: string | null
  address2?: string | null
  tel?: string | null
  slip_number?: string | null
  tracking_url?: string | null
  delivered: boolean
}

export interface RawColormeSale {
  id: number
  make_date: number
  update_date: number
  paid: boolean
  delivered: boolean
  canceled: boolean
  product_total_price: number
  delivery_total_charge: number
  tax: number
  total_price: number
  point_discount?: number
  gmo_point_discount?: number
  other_discount?: number
  customer?: { id?: number; mail?: string | null } | null
  details?: RawColormeSaleDetail[]
  sale_deliveries?: RawColormeSaleDelivery[]
  shop_coupon?: { code?: string } | null
  [key: string]: unknown
}

function unixToIso(seconds: number | undefined): string | undefined {
  return seconds != null ? new Date(seconds * 1000).toISOString() : undefined
}

function mapLineItem(raw: RawColormeSaleDetail): LineItem {
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    title: raw.product_name,
    quantity: raw.product_num,
    price: { amount: raw.price, currency: CURRENCY },
    sku: raw.product_model_number ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function mapShippingAddress(raw: RawColormeSaleDelivery | undefined): Address | undefined {
  if (!raw) return undefined
  return {
    line1: raw.address1 ?? undefined,
    line2: raw.address2 ?? undefined,
    region: raw.pref_name,
    postalCode: raw.postal ?? undefined,
    country: 'JP',
  }
}

export function transformOrder(raw: RawColormeSale): Order {
  const discountTotal =
    (raw.point_discount ?? 0) + (raw.gmo_point_discount ?? 0) + (raw.other_discount ?? 0)
  const delivery = raw.sale_deliveries?.[0]

  return {
    id: String(raw.id),
    customerId: raw.customer?.id != null ? String(raw.customer.id) : undefined,
    email: raw.customer?.mail ?? undefined,
    currency: CURRENCY,
    subtotalPrice: { amount: raw.product_total_price, currency: CURRENCY },
    totalTax: { amount: raw.tax, currency: CURRENCY },
    totalDiscounts: discountTotal > 0 ? { amount: discountTotal, currency: CURRENCY } : undefined,
    totalShipping: { amount: raw.delivery_total_charge, currency: CURRENCY },
    totalPrice: { amount: raw.total_price, currency: CURRENCY },
    financialStatus: raw.canceled ? 'VOIDED' : raw.paid ? 'PAID' : 'PENDING',
    fulfillmentStatus: raw.canceled ? undefined : raw.delivered ? 'FULFILLED' : 'UNFULFILLED',
    lineItems: (raw.details ?? []).map(mapLineItem),
    shippingAddress: mapShippingAddress(delivery),
    discountCodes: raw.shop_coupon?.code ? [raw.shop_coupon.code] : undefined,
    createdAt: unixToIso(raw.make_date),
    updatedAt: unixToIso(raw.update_date),
    cancelledAt: raw.canceled ? unixToIso(raw.update_date) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Order → ColorMe sale update body (`PUT /v1/sales/{id}`). Only
 * `paid` is writable from fields the canonical Order actually carries —
 * ColorMe's other writable fields (`sale_deliveries[].slip_number`, i.e.
 * tracking) have no canonical Order slot (that lives on Fulfillment, which
 * ColorMe does not expose — see metadata.ts), so this never touches them.
 */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (order.financialStatus === 'PAID') body.paid = true
  return body
}
