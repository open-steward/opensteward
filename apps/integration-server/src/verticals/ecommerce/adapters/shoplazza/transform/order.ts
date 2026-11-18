/**
 * Shoplazza Order → canonical Order.
 *
 * Maps Shoplazza's `financial_status` and `fulfillment_status` strings to the
 * canonical UPPER_SNAKE enums. Line items, addresses, and referenced ids
 * (fulfillments, refunds, transactions) are flattened onto the order.
 *
 * Key field names (from Go SDK / OpenAPI spec):
 *   total_price, sub_total (subtotal), total_discount, total_shipping,
 *   total_tax, financial_status, fulfillment_status, line_items,
 *   shipping_address, billing_address, customer.id, canceled_at, cancel_reason.
 *
 * Docs: https://www.shoplazza.dev/reference/api-usage
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawShoplazzaOrderAddress {
  address1?: string | null
  address2?: string | null
  city?: string | null
  province?: string | null
  province_code?: string | null
  zip?: string | null
  country?: string | null
  country_code?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
}

export interface RawShoplazzaTaxLine {
  title: string
  rate: number
  price?: string | number
}

export interface RawShoplazzaLineItem {
  id: number | string
  product_id?: number | string | null
  variant_id?: number | string | null
  /** `product_title` in Shoplazza SDK */
  product_title?: string | null
  /** `variant_title` in Shoplazza SDK */
  variant_title?: string | null
  /** `name` = combined title in Shoplazza SDK */
  name?: string | null
  title?: string | null
  quantity: number
  price?: string | number
  total_discount?: string | number
  sku?: string | null
  fulfillable_quantity?: number
  fulfillment_status?: string | null
  tax_lines?: RawShoplazzaTaxLine[]
  [key: string]: unknown
}

export interface RawShoplazzaOrder {
  id: number | string
  number?: number | string
  /** `name` is the human-readable order name (e.g. "#1001") */
  name?: string | null
  customer?: { id?: number | string; email?: string | null } | null
  email?: string | null
  phone?: string | null
  currency?: string
  /** `sub_total` in Shoplazza (not `subtotal_price`) */
  sub_total?: string | number | null
  total_tax?: string | number | null
  total_discount?: string | number | null
  total_shipping?: string | number | null
  total_price?: string | number | null
  financial_status?: string | null
  fulfillment_status?: string | null
  line_items?: RawShoplazzaLineItem[]
  billing_address?: RawShoplazzaOrderAddress | null
  shipping_address?: RawShoplazzaOrderAddress | null
  fulfillments?: Array<{ id: number | string }>
  refunds?: Array<{ id: number | string }>
  transactions?: Array<{ id: number | string }>
  discount_code?: string | null
  discount_codes?: Array<{ code: string; amount?: string | number; type?: string }>
  tags?: string | null
  note?: string | null
  created_at?: string
  updated_at?: string
  placed_at?: string | null
  canceled_at?: string | null
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

function mapAddress(raw: RawShoplazzaOrderAddress | null | undefined): Address | undefined {
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

function resolveTitle(raw: RawShoplazzaLineItem): string {
  return raw.name ?? raw.title ?? raw.product_title ?? raw.variant_title ?? ''
}

function mapLineItem(raw: RawShoplazzaLineItem, currency: string): LineItem {
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId: raw.variant_id != null ? String(raw.variant_id) : undefined,
    title: resolveTitle(raw),
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

function splitTags(tags: string | null | undefined): string[] | undefined {
  if (!tags) return undefined
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

function collectDiscountCodes(raw: RawShoplazzaOrder): string[] | undefined {
  const codes: string[] = []
  // Shoplazza may have a single `discount_code` string or an array
  if (raw.discount_code) codes.push(raw.discount_code)
  if (raw.discount_codes) {
    for (const dc of raw.discount_codes) {
      if (dc.code && !codes.includes(dc.code)) codes.push(dc.code)
    }
  }
  return codes.length > 0 ? codes : undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawShoplazzaOrder): Order {
  const currency = raw.currency ?? 'USD'
  const money = (v: string | number | null | undefined) => ({
    amount: toMinor(v, currency),
    currency,
  })

  const customerId =
    raw.customer?.id != null
      ? String(raw.customer.id)
      : undefined

  const email = raw.email ?? raw.customer?.email ?? undefined

  return {
    id: String(raw.id),
    orderNumber: raw.number != null ? String(raw.number) : undefined,
    name: raw.name ?? undefined,
    customerId,
    email: email ?? undefined,
    phone: raw.phone ?? undefined,
    currency,
    subtotalPrice: raw.sub_total != null ? money(raw.sub_total) : undefined,
    totalTax: raw.total_tax != null ? money(raw.total_tax) : undefined,
    totalDiscounts: raw.total_discount != null ? money(raw.total_discount) : undefined,
    totalShipping:
      raw.total_shipping != null ? money(raw.total_shipping) : undefined,
    totalPrice: raw.total_price != null ? money(raw.total_price) : undefined,
    financialStatus: raw.financial_status
      ? FIN_STATUS_MAP[raw.financial_status] ?? undefined
      : undefined,
    fulfillmentStatus: raw.fulfillment_status
      ? FUL_STATUS_MAP[raw.fulfillment_status] ?? undefined
      : undefined,
    lineItems: (raw.line_items ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    fulfillmentIds: raw.fulfillments?.map((f) => String(f.id)),
    refundIds: raw.refunds?.map((r) => String(r.id)),
    transactionIds: raw.transactions?.map((t) => String(t.id)),
    discountCodes: collectDiscountCodes(raw),
    tags: splitTags(raw.tags),
    note: raw.note ?? undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    processedAt: raw.placed_at ?? undefined,
    cancelledAt: raw.canceled_at ?? undefined,
    cancelReason: raw.cancel_reason ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Shoplazza order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    email: order.email,
    phone: order.phone,
    currency: order.currency,
    note: order.note,
    tags: order.tags?.join(','),
    line_items: order.lineItems?.map((li) => ({
      variant_id: li.variantId,
      quantity: li.quantity,
      price: minorToMajor(li.price?.amount, li.price?.currency)?.toFixed(2),
      title: li.title,
      sku: li.sku,
    })),
  }
}
