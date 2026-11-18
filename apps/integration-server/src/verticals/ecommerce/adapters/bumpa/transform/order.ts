/**
 * Bumpa Order → canonical Order.
 *
 * Bumpa exposes order records via GET /v1/orders/:id. Order status is
 * represented with a string `status` field covering both payment and
 * fulfillment state. Line items are nested under `order_items` or
 * `items`. Addresses are flat objects on the order.
 *
 * Prices are decimal major-unit strings; we convert to minor units.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw Bumpa shapes ─────────────────────────────────────────────────────────

export interface RawBumpaAddress {
  address?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  postal_code?: string | null
  zip?: string | null
  [key: string]: unknown
}

export interface RawBumpaLineItem {
  id: number | string
  product_id?: number | string | null
  variant_id?: number | string | null
  name?: string
  title?: string
  quantity?: number
  price?: string | number
  discount?: string | number | null
  sku?: string | null
  [key: string]: unknown
}

export interface RawBumpaOrder {
  id: number | string
  order_number?: number | string
  reference?: string
  customer_id?: number | string | null
  customer?: { id?: number | string } | null
  email?: string | null
  phone?: string | null
  currency?: string
  subtotal?: string | number
  subtotal_price?: string | number
  tax?: string | number
  total_tax?: string | number
  discount?: string | number
  total_discounts?: string | number
  shipping?: string | number
  total_shipping?: string | number
  total?: string | number
  total_price?: string | number
  amount?: string | number
  status?: string | null
  payment_status?: string | null
  fulfillment_status?: string | null
  order_items?: RawBumpaLineItem[]
  items?: RawBumpaLineItem[]
  line_items?: RawBumpaLineItem[]
  billing_address?: RawBumpaAddress | null
  shipping_address?: RawBumpaAddress | null
  discount_code?: string | null
  discount_codes?: Array<{ code: string }> | string[] | null
  note?: string | null
  created_at?: string
  updated_at?: string
  cancelled_at?: string | null
  cancel_reason?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : 0
}

function toMinor(v: string | number | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

function mapAddress(raw: RawBumpaAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? raw.address ?? undefined
  const city = raw.city ?? undefined
  const country = raw.country ?? undefined
  const postalCode = raw.postal_code ?? raw.zip ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address2 ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

const FIN_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  pending: 'PENDING',
  awaiting_payment: 'PENDING',
  authorized: 'AUTHORIZED',
  partially_paid: 'PARTIALLY_PAID',
  paid: 'PAID',
  partially_refunded: 'PARTIALLY_REFUNDED',
  refunded: 'REFUNDED',
  voided: 'VOIDED',
}

const FUL_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  unfulfilled: 'UNFULFILLED',
  pending: 'UNFULFILLED',
  partial: 'PARTIAL',
  partially_fulfilled: 'PARTIAL',
  fulfilled: 'FULFILLED',
  delivered: 'FULFILLED',
  restocked: 'RESTOCKED',
  cancelled: 'RESTOCKED',
}

function mapPaymentStatus(s: string | null | undefined): OrderFinancialStatus | undefined {
  if (!s) return undefined
  return FIN_STATUS_MAP[s.toLowerCase()] ?? undefined
}

function mapFulfillmentStatus(s: string | null | undefined): OrderFulfillmentStatus | undefined {
  if (!s) return undefined
  return FUL_STATUS_MAP[s.toLowerCase()] ?? undefined
}

/**
 * Bumpa uses a single `status` field for the order. Try to derive separate
 * financial and fulfillment statuses from it.
 */
function deriveStatuses(raw: RawBumpaOrder): {
  financialStatus: OrderFinancialStatus | undefined
  fulfillmentStatus: OrderFulfillmentStatus | undefined
} {
  const financialStatus =
    mapPaymentStatus(raw.payment_status) ??
    mapPaymentStatus(raw.status)
  const fulfillmentStatus =
    mapFulfillmentStatus(raw.fulfillment_status) ??
    mapFulfillmentStatus(raw.status)
  return { financialStatus, fulfillmentStatus }
}

function mapLineItem(raw: RawBumpaLineItem, currency: string): LineItem {
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId: raw.variant_id != null ? String(raw.variant_id) : undefined,
    title: (raw.name ?? raw.title) as string,
    quantity: raw.quantity ?? 1,
    price: { amount: toMinor(raw.price, currency), currency },
    totalDiscount:
      raw.discount != null
        ? { amount: toMinor(raw.discount, currency), currency }
        : undefined,
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function parseDiscountCodes(
  raw: RawBumpaOrder,
): string[] | undefined {
  if (raw.discount_codes) {
    const codes = raw.discount_codes
    if (Array.isArray(codes)) {
      return codes.map((c) => (typeof c === 'string' ? c : (c as { code: string }).code))
    }
  }
  if (raw.discount_code) return [raw.discount_code]
  return undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawBumpaOrder): Order {
  const currency = (raw.currency as string | undefined) ?? 'NGN'
  const money = (v: string | number | null | undefined) => ({ amount: toMinor(v, currency), currency })
  const { financialStatus, fulfillmentStatus } = deriveStatuses(raw)

  const rawItems = raw.order_items ?? raw.items ?? raw.line_items ?? []

  const customerId =
    raw.customer_id != null
      ? String(raw.customer_id)
      : raw.customer?.id != null
        ? String(raw.customer.id)
        : undefined

  const subtotal = raw.subtotal ?? raw.subtotal_price
  const totalTax = raw.tax ?? raw.total_tax
  const totalDiscount = raw.discount ?? raw.total_discounts
  const totalShipping = raw.shipping ?? raw.total_shipping
  const totalPrice = raw.total ?? raw.total_price ?? raw.amount

  return {
    id: String(raw.id),
    orderNumber: raw.order_number != null ? String(raw.order_number) : raw.reference,
    name: raw.reference ?? (raw.order_number != null ? String(raw.order_number) : undefined),
    customerId,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    currency,
    subtotalPrice: subtotal != null ? money(subtotal) : undefined,
    totalTax: totalTax != null ? money(totalTax) : undefined,
    totalDiscounts: totalDiscount != null ? money(totalDiscount) : undefined,
    totalShipping: totalShipping != null ? money(totalShipping) : undefined,
    totalPrice: totalPrice != null ? money(totalPrice) : undefined,
    financialStatus,
    fulfillmentStatus,
    lineItems: rawItems.map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    discountCodes: parseDiscountCodes(raw),
    note: raw.note ?? undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    cancelledAt: raw.cancelled_at ?? undefined,
    cancelReason: raw.cancel_reason ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Bumpa order body (for create). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  // Canonical line-item price is a minor-unit integer; Bumpa expects major-unit decimal.
  return {
    email: order.email,
    phone: order.phone,
    currency: order.currency,
    note: order.note,
    items: order.lineItems?.map((li) => ({
      product_id: li.productId,
      variant_id: li.variantId,
      quantity: li.quantity,
      price: minorToMajor(li.price?.amount, li.price?.currency),
      name: li.title,
      sku: li.sku,
    })),
  }
}
