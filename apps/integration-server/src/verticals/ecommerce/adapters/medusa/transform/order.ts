/**
 * Medusa v2 Order → canonical Order.
 *
 * Medusa v2 order statuses: pending, completed, archived, canceled,
 * requires_action. We split into financial + fulfillment canonical pairs.
 *
 * Money: Medusa v2 uses integer cents (minor units), which is already the
 * canonical `Money.amount` representation — pass through unchanged.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'

// ── Raw Medusa shapes ──────────────────────────────────────────────────────

export interface RawMedusaOrderAddress {
  first_name?: string | null
  last_name?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  province?: string | null
  postal_code?: string | null
  country_code?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface RawMedusaLineItem {
  id: string
  title?: string
  product_id?: string | null
  variant_id?: string | null
  quantity: number
  unit_price?: number
  subtotal?: number
  total?: number
  tax_total?: number
  discount_total?: number
  thumbnail?: string | null
  [key: string]: unknown
}

export interface RawMedusaOrder {
  id: string
  display_id?: number
  status?: string
  fulfillment_status?: string
  payment_status?: string
  customer_id?: string | null
  email?: string | null
  currency_code?: string
  subtotal?: number
  tax_total?: number
  discount_total?: number
  shipping_total?: number
  total?: number
  items?: RawMedusaLineItem[]
  billing_address?: RawMedusaOrderAddress | null
  shipping_address?: RawMedusaOrderAddress | null
  fulfillments?: Array<{ id: string }> | null
  refunds?: Array<{ id: string }> | null
  discounts?: Array<{ code?: string }> | null
  payments?: Array<{ id: string }> | null
  note?: string | null
  canceled_at?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Medusa reports monetary amounts as integer minor units (cents), which is
 * already the canonical `Money.amount` representation. Pass the integer
 * through (rounding to guard against fractional inputs).
 */
function toMinorUnits(v: number | null | undefined): number {
  if (v == null) return 0
  return Math.round(v)
}

function mapAddress(raw: RawMedusaOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address_1 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.postal_code ?? undefined
  const country = raw.country_code ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address_2 ?? undefined,
    city,
    region: raw.province ?? undefined,
    postalCode,
    country,
  }
}

function mapFinancialStatus(
  status: string | undefined,
  paymentStatus: string | undefined,
): OrderFinancialStatus | undefined {
  // Check payment_status first for financial state
  if (paymentStatus) {
    switch (paymentStatus) {
      case 'captured':
      case 'paid':
        return 'PAID'
      case 'refunded':
        return 'REFUNDED'
      case 'partially_refunded':
        return 'PARTIALLY_REFUNDED'
      case 'awaiting':
      case 'not_paid':
        return 'PENDING'
      case 'authorized':
        return 'AUTHORIZED'
    }
  }
  // Fall back to order status
  switch (status) {
    case 'pending':
    case 'requires_action':
      return 'PENDING'
    case 'completed':
      return 'PAID'
    case 'canceled':
      return 'VOIDED'
    default:
      return undefined
  }
}

function mapFulfillmentStatus(
  status: string | undefined,
  fulfillmentStatus: string | undefined,
): OrderFulfillmentStatus | undefined {
  if (fulfillmentStatus) {
    switch (fulfillmentStatus) {
      case 'fulfilled':
      case 'shipped':
      case 'delivered':
        return 'FULFILLED'
      case 'partially_fulfilled':
      case 'partially_shipped':
        return 'PARTIAL'
      case 'not_fulfilled':
        return 'UNFULFILLED'
      case 'returned':
        return 'RESTOCKED'
    }
  }
  switch (status) {
    case 'pending':
    case 'requires_action':
      return 'UNFULFILLED'
    case 'completed':
      return 'FULFILLED'
    case 'canceled':
      return 'UNFULFILLED'
    default:
      return 'UNFULFILLED'
  }
}

function mapLineItem(raw: RawMedusaLineItem, currency: string): LineItem {
  const unitPrice = toMinorUnits(raw.unit_price)
  return {
    id: raw.id,
    productId: raw.product_id ?? undefined,
    variantId: raw.variant_id ?? undefined,
    title: raw.title ?? '',
    quantity: raw.quantity,
    price: { amount: unitPrice, currency },
    totalDiscount:
      raw.discount_total != null && raw.discount_total > 0
        ? { amount: toMinorUnits(raw.discount_total), currency }
        : undefined,
    sku: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawMedusaOrder): Order {
  const currency = raw.currency_code ?? 'USD'
  const money = (v: number | null | undefined) => ({
    amount: toMinorUnits(v),
    currency,
  })

  return {
    id: raw.id,
    orderNumber: raw.display_id != null ? String(raw.display_id) : undefined,
    name: raw.display_id != null ? `#${raw.display_id}` : undefined,
    customerId: raw.customer_id ?? undefined,
    email: raw.email ?? undefined,
    currency,
    subtotalPrice: raw.subtotal != null ? money(raw.subtotal) : undefined,
    totalTax: raw.tax_total != null ? money(raw.tax_total) : undefined,
    totalDiscounts: raw.discount_total != null ? money(raw.discount_total) : undefined,
    totalShipping: raw.shipping_total != null ? money(raw.shipping_total) : undefined,
    totalPrice: raw.total != null ? money(raw.total) : undefined,
    financialStatus: mapFinancialStatus(raw.status, raw.payment_status),
    fulfillmentStatus: mapFulfillmentStatus(raw.status, raw.fulfillment_status),
    lineItems: (raw.items ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    fulfillmentIds: raw.fulfillments?.map((f) => f.id),
    refundIds: raw.refunds?.map((r) => r.id),
    discountCodes: raw.discounts
      ?.map((d) => d.code)
      .filter((c): c is string => c != null),
    note: raw.note ?? undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    cancelledAt: raw.canceled_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Medusa order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  function buildAddress(a: Address | undefined): Record<string, unknown> | undefined {
    if (!a) return undefined
    return {
      address_1: a.line1,
      address_2: a.line2,
      city: a.city,
      province: a.region,
      postal_code: a.postalCode,
      country_code: a.country,
    }
  }

  return {
    email: order.email,
    customer_id: order.customerId,
    currency_code: order.currency,
    billing_address: buildAddress(order.billingAddress),
    shipping_address: buildAddress(order.shippingAddress),
    items: order.lineItems?.map((li) => ({
      title: li.title,
      quantity: li.quantity,
      unit_price: li.price?.amount != null ? Math.round(li.price.amount) : undefined,
      variant_id: li.variantId,
    })),
  }
}
