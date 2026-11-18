/**
 * CartPanda Order → canonical Order.
 *
 * Maps CartPanda's `financial_status` / `payment_status` and
 * `fulfillment_status` strings to the canonical UPPER_SNAKE enums. Line
 * items, addresses, and referenced ids are flattened onto the order.
 *
 * CartPanda is a Brazilian-focused platform; the default currency is BRL
 * when not specified by the API response.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw CartPanda shapes ──────────────────────────────────────────────────────

export interface RawCartpandaOrderAddress {
  address1?: string | null
  address2?: string | null
  city?: string | null
  province?: string | null
  province_code?: string | null
  zip?: string | null
  country?: string | null
  country_code?: string | null
}

export interface RawCartpandaTaxLine {
  title: string
  rate: number
  price?: string | number
}

export interface RawCartpandaLineItem {
  id: number | string
  product_id?: number | string | null
  variant_id?: number | string | null
  title: string
  quantity: number
  price?: string | number
  total_discount?: string | number
  sku?: string | null
  fulfillable_quantity?: number
  fulfillment_status?: string | null
  tax_lines?: RawCartpandaTaxLine[]
}

export interface RawCartpandaOrder {
  id: number | string
  /** Human-readable order number, e.g. 1042. */
  order_number?: number | string
  /** Display name, e.g. "#1042". */
  name?: string
  /** Nested customer object. */
  customer?: { id?: number | string; email?: string | null } | null
  /** Customer email (may also be on customer sub-object). */
  email?: string | null
  phone?: string | null
  /** ISO 4217 currency code. */
  currency?: string
  subtotal_price?: string | number
  total_tax?: string | number
  total_discounts?: string | number
  total_shipping?: string | number
  total_price?: string | number
  /**
   * CartPanda financial/payment status:
   *   "pending", "paid", "refunded", "voided", "authorized",
   *   "partially_paid", "partially_refunded"
   */
  financial_status?: string | null
  /** CartPanda may also expose payment_status as an alternative field. */
  payment_status?: string | null
  /**
   * CartPanda fulfillment status:
   *   "unfulfilled", "partial", "fulfilled"
   */
  fulfillment_status?: string | null
  items?: RawCartpandaLineItem[]
  line_items?: RawCartpandaLineItem[]
  billing_address?: RawCartpandaOrderAddress | null
  shipping_address?: RawCartpandaOrderAddress | null
  fulfillments?: Array<{ id: number | string }>
  refunds?: Array<{ id: number | string }>
  transactions?: Array<{ id: number | string }>
  discount_codes?: Array<{ code: string }>
  tags?: string
  note?: string | null
  created_at?: string
  updated_at?: string
  processed_at?: string | null
  cancelled_at?: string | null
  cancel_reason?: string | null
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

function mapAddress(raw: RawCartpandaOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const city = raw.city ?? undefined
  const country = raw.country_code ?? raw.country ?? undefined
  const postalCode = raw.zip ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address2 ?? undefined,
    city,
    region: raw.province ?? raw.province_code ?? undefined,
    postalCode,
    country,
  }
}

const FIN_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  pending: 'PENDING',
  authorized: 'AUTHORIZED',
  partially_paid: 'PARTIALLY_PAID',
  paid: 'PAID',
  partially_refunded: 'PARTIALLY_REFUNDED',
  refunded: 'REFUNDED',
  voided: 'VOIDED',
}

const FUL_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  unfulfilled: 'UNFULFILLED',
  partial: 'PARTIAL',
  fulfilled: 'FULFILLED',
  restocked: 'RESTOCKED',
}

function mapLineItem(raw: RawCartpandaLineItem, currency: string): LineItem {
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId: raw.variant_id != null ? String(raw.variant_id) : undefined,
    title: raw.title,
    quantity: raw.quantity,
    price: { amount: toMinor(raw.price, currency), currency },
    totalDiscount:
      raw.total_discount != null
        ? { amount: toMinor(raw.total_discount, currency), currency }
        : undefined,
    taxLines: raw.tax_lines?.map((tl) => ({
      title: tl.title,
      rate: tl.rate,
      amount: { amount: toMinor(tl.price, currency), currency },
    })),
    sku: raw.sku ?? undefined,
    fulfillableQuantity: raw.fulfillable_quantity,
    fulfillmentStatus: raw.fulfillment_status
      ? FUL_STATUS_MAP[raw.fulfillment_status] ?? undefined
      : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function splitTags(tags: string | undefined): string[] | undefined {
  if (!tags) return undefined
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawCartpandaOrder): Order {
  const currency = raw.currency ?? 'BRL'
  const money = (v: string | number | null | undefined) => ({
    amount: toMinor(v, currency),
    currency,
  })

  // CartPanda may put line items under `items` or `line_items`.
  const lineItems = (raw.line_items ?? raw.items ?? []).map((li) =>
    mapLineItem(li, currency),
  )

  const rawFinStatus = raw.financial_status ?? raw.payment_status ?? undefined

  return {
    id: String(raw.id),
    orderNumber: raw.order_number != null ? String(raw.order_number) : undefined,
    name: raw.name,
    customerId:
      raw.customer?.id != null
        ? String(raw.customer.id)
        : undefined,
    email: raw.email ?? raw.customer?.email ?? undefined,
    phone: raw.phone ?? undefined,
    currency,
    subtotalPrice: raw.subtotal_price != null ? money(raw.subtotal_price) : undefined,
    totalTax: raw.total_tax != null ? money(raw.total_tax) : undefined,
    totalDiscounts: raw.total_discounts != null ? money(raw.total_discounts) : undefined,
    totalShipping: raw.total_shipping != null ? money(raw.total_shipping) : undefined,
    totalPrice: raw.total_price != null ? money(raw.total_price) : undefined,
    financialStatus: rawFinStatus
      ? FIN_STATUS_MAP[rawFinStatus.toLowerCase()] ?? undefined
      : undefined,
    fulfillmentStatus: raw.fulfillment_status
      ? FUL_STATUS_MAP[raw.fulfillment_status.toLowerCase()] ?? undefined
      : undefined,
    lineItems,
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    fulfillmentIds: raw.fulfillments?.map((f) => String(f.id)),
    refundIds: raw.refunds?.map((r) => String(r.id)),
    transactionIds: raw.transactions?.map((t) => String(t.id)),
    discountCodes: raw.discount_codes?.map((d) => d.code),
    tags: splitTags(raw.tags),
    note: raw.note ?? undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    processedAt: raw.processed_at ?? undefined,
    cancelledAt: raw.cancelled_at ?? undefined,
    cancelReason: raw.cancel_reason ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → CartPanda order body (for create). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    email: order.email,
    phone: order.phone,
    currency: order.currency,
    note: order.note,
    tags: order.tags?.join(', '),
    line_items: order.lineItems?.map((li) => ({
      variant_id: li.variantId,
      quantity: li.quantity,
      price: li.price?.amount,
      title: li.title,
      sku: li.sku,
    })),
  }
}
