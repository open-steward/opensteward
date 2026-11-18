/**
 * Salla Order → canonical Order.
 *
 * Salla order structure (detail endpoint):
 *  - `id`, `reference_id`, `currency`
 *  - `amounts`: { sub_total, shipping_cost, tax { percent, amount }, discounts[], total }
 *  - `status`: { id, name, slug }
 *  - `payment_method`
 *  - `date`, `updated_at`
 *  - `customer`: { id, first_name, last_name, mobile, email, address }
 *  - `items[]`: { name, quantity, sku, product { id, thumbnail }, options }
 *  - `shipping`: { company, address, shipment }
 *
 * All money amounts come as decimal major units (e.g. "99.50" SAR).
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

// ── Raw Salla shapes ─────────────────────────────────────────────────────────

export interface RawSallaAmountObj {
  amount: number
  currency: string
}

export interface RawSallaOrderAmounts {
  sub_total?: RawSallaAmountObj
  shipping_cost?: RawSallaAmountObj
  cash_on_delivery?: RawSallaAmountObj
  tax?: { percent?: number; amount?: RawSallaAmountObj }
  discounts?: Array<{ amount?: RawSallaAmountObj; name?: string }>
  total?: RawSallaAmountObj
}

export interface RawSallaOrderStatus {
  id?: number | string
  name?: string
  slug?: string
}

export interface RawSallaOrderItemProduct {
  id?: number | string
  thumbnail?: string
}

export interface RawSallaOrderItem {
  id?: number | string
  name: string
  quantity: number
  sku?: string | null
  product?: RawSallaOrderItemProduct
  unit_price?: RawSallaAmountObj
  total?: RawSallaAmountObj
  discount?: RawSallaAmountObj
  tax?: RawSallaAmountObj
}

export interface RawSallaOrderCustomer {
  id?: number | string
  first_name?: string
  last_name?: string
  mobile?: string | number
  email?: string
  city?: string
  country?: string
  country_code?: string
  location?: string
}

export interface RawSallaOrderShipping {
  company?: string
  address?: {
    name?: string
    block?: string
    avenue?: string
    street?: string
    city?: string
    country?: string
    country_code?: string
    postal_code?: string
  }
  shipment?: { id?: number | string }
}

export interface RawSallaDateObj {
  date?: string
  timezone?: string
}

export interface RawSallaOrder {
  id: number | string
  reference_id?: number | string
  currency?: string
  status?: RawSallaOrderStatus
  payment_method?: string
  draft?: boolean
  amounts?: RawSallaOrderAmounts
  items?: RawSallaOrderItem[]
  customer?: RawSallaOrderCustomer
  shipping?: RawSallaOrderShipping
  shipments?: Array<{ id?: number | string }> | null
  date?: RawSallaDateObj | string
  updated_at?: RawSallaDateObj | string
  can_cancel?: boolean
  coupon?: { code?: string } | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMinor(obj: RawSallaAmountObj | null | undefined, fallbackCurrency: string): { amount: number; currency: string } | undefined {
  if (!obj) return undefined
  return {
    amount: majorToMinor(obj.amount, obj.currency ?? fallbackCurrency),
    currency: obj.currency ?? fallbackCurrency,
  }
}

function parseSallaDate(date: RawSallaDateObj | string | null | undefined): string | undefined {
  if (!date) return undefined
  if (typeof date === 'string') return toIsoDatetime(date)
  if (date.date) {
    // Format: "2022-06-16 14:48:20.000000" — toIsoDatetime normalises the space separator
    return toIsoDatetime(date.date)
  }
  return undefined
}

function mapOrderAddress(
  raw: RawSallaOrderShipping['address'] | null | undefined,
): Address | undefined {
  if (!raw) return undefined
  const city = raw.city ?? undefined
  const country = raw.country_code ?? raw.country ?? undefined
  const postalCode = raw.postal_code ?? undefined
  if (!city && !country && !postalCode) return undefined
  return {
    line1: [raw.street, raw.avenue, raw.block].filter(Boolean).join(', ') || undefined,
    city,
    country,
    postalCode,
  }
}

// Salla uses numeric status IDs; we map by slug
const FIN_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  pending: 'PENDING',
  waiting: 'PENDING',
  under_review: 'PENDING',
  authorized: 'AUTHORIZED',
  partially_paid: 'PARTIALLY_PAID',
  paid: 'PAID',
  refunded: 'REFUNDED',
  partially_refunded: 'PARTIALLY_REFUNDED',
  voided: 'VOIDED',
  cancelled: 'VOIDED',
  canceled: 'VOIDED',
}

const FUL_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  delivering: 'PARTIAL',
  delivered: 'FULFILLED',
  shipped: 'FULFILLED',
  in_progress: 'PARTIAL',
  fulfilled: 'FULFILLED',
  unfulfilled: 'UNFULFILLED',
  created: 'UNFULFILLED',
}

function mapStatus(status: RawSallaOrderStatus | undefined, _currency: string): {
  financialStatus: OrderFinancialStatus | undefined
  fulfillmentStatus: OrderFulfillmentStatus | undefined
} {
  if (!status?.slug) return { financialStatus: undefined, fulfillmentStatus: undefined }
  const slug = status.slug.toLowerCase()
  return {
    financialStatus: FIN_STATUS_MAP[slug],
    fulfillmentStatus: FUL_STATUS_MAP[slug],
  }
}

function mapLineItem(raw: RawSallaOrderItem, currency: string): LineItem {
  return {
    id: raw.id != null ? String(raw.id) : raw.name,
    productId: raw.product?.id != null ? String(raw.product.id) : undefined,
    title: raw.name,
    quantity: raw.quantity,
    price: toMinor(raw.unit_price, currency) ?? { amount: 0, currency },
    totalDiscount: toMinor(raw.discount, currency),
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawSallaOrder): Order {
  const currency = raw.currency ?? 'SAR'
  const amounts = raw.amounts
  const { financialStatus, fulfillmentStatus } = mapStatus(raw.status, currency)

  const shippingAddress = mapOrderAddress(raw.shipping?.address)
  const discountCodes = raw.coupon?.code ? [raw.coupon.code] : undefined

  // Total discount = sum of amounts.discounts
  const totalDiscountAmount = amounts?.discounts?.reduce((sum, d) => {
    return sum + (d.amount?.amount ?? 0)
  }, 0)
  const totalDiscountCurrency = amounts?.discounts?.[0]?.amount?.currency ?? currency

  return {
    id: String(raw.id),
    orderNumber: raw.reference_id != null ? String(raw.reference_id) : undefined,
    customerId: raw.customer?.id != null ? String(raw.customer.id) : undefined,
    email: raw.customer?.email ?? undefined,
    phone: raw.customer?.mobile != null ? String(raw.customer.mobile) : undefined,
    currency,
    subtotalPrice: toMinor(amounts?.sub_total, currency),
    totalTax: toMinor(amounts?.tax?.amount, currency),
    totalDiscounts:
      totalDiscountAmount != null && totalDiscountAmount > 0
        ? {
            amount: majorToMinor(totalDiscountAmount, totalDiscountCurrency),
            currency: totalDiscountCurrency,
          }
        : undefined,
    totalShipping: toMinor(amounts?.shipping_cost, currency),
    totalPrice: toMinor(amounts?.total, currency),
    financialStatus,
    fulfillmentStatus,
    lineItems: (raw.items ?? []).map((li) => mapLineItem(li, currency)),
    shippingAddress,
    fulfillmentIds: raw.shipments
      ? raw.shipments.map((s) => String(s.id)).filter(Boolean)
      : undefined,
    discountCodes,
    createdAt: parseSallaDate(raw.date),
    updatedAt: parseSallaDate(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Salla order body (minimal; most fields are read-only). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    email: order.email,
    currency: order.currency,
    note: order.note,
  }
}
