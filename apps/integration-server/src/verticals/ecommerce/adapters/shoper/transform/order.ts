/**
 * Shoper Order → canonical Order.
 *
 * Shoper orders live under GET /webapi/rest/orders[/{id}].
 * Each order has a status_id (numeric), financial info, and a list of
 * products referenced via GET /webapi/rest/order-products?order_id={id}.
 * Line items are optionally embedded in the order; if absent the caller
 * must fetch them separately.
 *
 * Financial status is derived from Shoper's payment_id / status combination.
 * Fulfillment status is derived from the delivery tracking data.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Shoper shapes ────────────────────────────────────────────────────────

export interface RawShoperOrderAddress {
  firstname?: string | null
  lastname?: string | null
  company?: string | null
  street?: string | null
  apartment?: string | null
  postcode?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  country_code?: string | null
  [key: string]: unknown
}

export interface RawShoperOrderProduct {
  order_product_id?: number | string
  product_id?: number | string | null
  name?: string | null
  quantity?: number
  price?: string | number
  code?: string | null
  [key: string]: unknown
}

export interface RawShoperOrder {
  order_id: number | string
  user_id?: number | string | null
  email?: string | null
  phone?: string | null
  currency?: string | null
  /** Numeric Shoper status id (1=new, 2=processing, 3=completed, etc.) */
  status_id?: number | string | null
  payment_id?: number | string | null
  /** 0 = not paid, 1 = paid */
  payment_status?: number | string | null
  delivery_id?: number | string | null
  /** Order total price (decimal string). */
  sum?: string | number | null
  /** Subtotal without shipping. */
  subtotal?: string | number | null
  /** Tax amount. */
  tax?: string | number | null
  /** Discount amount. */
  discount?: string | number | null
  /** Shipping cost. */
  delivery_sum?: string | number | null
  /** Display order number/name (may differ from order_id). */
  order_number?: string | number | null
  delivery_address?: RawShoperOrderAddress | null
  billing_address?: RawShoperOrderAddress | null
  products?: RawShoperOrderProduct[]
  /** Embedded shipment/fulfillment IDs. */
  fulfillment_ids?: Array<number | string>
  notes?: string | null
  add_date?: string | null
  edit_date?: string | null
  discount_code?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapAddress(raw: RawShoperOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.postcode ?? undefined
  const country = raw.country_code ?? raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.apartment ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

/**
 * Map Shoper's payment_status field to canonical financial status.
 * Shoper: 0 = unpaid / pending, 1 = paid.
 */
function mapFinancialStatus(
  paymentStatus: number | string | null | undefined,
  statusId: number | string | null | undefined,
): OrderFinancialStatus | undefined {
  const ps = toNum(paymentStatus)
  if (ps === 1) return 'PAID'
  // statusId=4 typically means cancelled in Shoper
  if (toNum(statusId) === 4) return 'VOIDED'
  return 'PENDING'
}

/**
 * Derive fulfillment status from Shoper order status.
 * Shoper status IDs: 1=new, 2=processing, 3=shipped/fulfilled, 4=cancelled, 5=returned.
 */
function mapFulfillmentStatus(
  statusId: number | string | null | undefined,
): OrderFulfillmentStatus | undefined {
  switch (toNum(statusId)) {
    case 3:
      return 'FULFILLED'
    case 4:
      return 'RESTOCKED'
    case 2:
      return 'PARTIAL'
    default:
      return 'UNFULFILLED'
  }
}

function mapLineItem(
  raw: RawShoperOrderProduct,
  currency: string,
  orderId: string,
  index: number,
): LineItem {
  return {
    id: String(raw.order_product_id ?? raw.product_id ?? `${orderId}_${index}`),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId: undefined,
    title: raw.name ?? '',
    quantity: raw.quantity ?? 1,
    price: { amount: majorToMinor(toNum(raw.price), currency), currency },
    totalDiscount: undefined,
    taxLines: undefined,
    sku: raw.code ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawShoperOrder): Order {
  const currency = raw.currency ?? 'PLN'
  const money = (v: string | number | null | undefined) => ({
    amount: majorToMinor(toNum(v), currency),
    currency,
  })

  return {
    id: String(raw.order_id),
    orderNumber:
      raw.order_number != null ? String(raw.order_number) : String(raw.order_id),
    name: raw.order_number != null ? String(raw.order_number) : undefined,
    customerId: raw.user_id != null ? String(raw.user_id) : undefined,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    currency,
    subtotalPrice: raw.subtotal != null ? money(raw.subtotal) : undefined,
    totalTax: raw.tax != null ? money(raw.tax) : undefined,
    totalDiscounts: raw.discount != null ? money(raw.discount) : undefined,
    totalShipping: raw.delivery_sum != null ? money(raw.delivery_sum) : undefined,
    totalPrice: raw.sum != null ? money(raw.sum) : undefined,
    financialStatus: mapFinancialStatus(raw.payment_status, raw.status_id),
    fulfillmentStatus: mapFulfillmentStatus(raw.status_id),
    lineItems: (raw.products ?? []).map((p, idx) => mapLineItem(p, currency, String(raw.order_id), idx)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.delivery_address),
    fulfillmentIds: raw.fulfillment_ids?.map((id) => String(id)),
    refundIds: undefined,
    transactionIds: undefined,
    discountCodes: raw.discount_code ? [raw.discount_code] : undefined,
    tags: undefined,
    note: raw.notes ?? undefined,
    createdAt: raw.add_date ?? undefined,
    updatedAt: raw.edit_date ?? undefined,
    processedAt: raw.add_date ?? undefined,
    cancelledAt: undefined,
    cancelReason: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Shoper order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    email: order.email,
    phone: order.phone,
    currency: order.currency,
    notes: order.note,
    delivery_address: order.shippingAddress
      ? {
          street: order.shippingAddress.line1,
          apartment: order.shippingAddress.line2,
          city: order.shippingAddress.city,
          postcode: order.shippingAddress.postalCode,
          state: order.shippingAddress.region,
          country_code: order.shippingAddress.country,
        }
      : undefined,
  }
}
