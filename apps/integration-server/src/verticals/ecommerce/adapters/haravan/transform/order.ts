/**
 * Haravan Order → canonical Order.
 *
 * Field names match Shopify's Order resource one-for-one (confirmed against
 * live doc examples, not by analogy): `financial_status`,
 * `fulfillment_status`, `line_items[]`, `shipping_lines[]`,
 * `discount_codes[]`, `billing_address`/`shipping_address`.
 *
 * Docs: https://docs.haravan.com/docs/omni-apis/orders/
 */

import type { Order, LineItem, OrderFinancialStatus, OrderFulfillmentStatus } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import type { RawHaravanRefund } from './refund'
import type { RawHaravanTransaction } from './transaction'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawHaravanOrderAddress {
  address1?: string | null
  address2?: string | null
  city?: string | null
  province?: string | null
  province_code?: string | null
  zip?: string | null
  country?: string | null
  country_code?: string | null
}

export interface RawHaravanTaxLine {
  title: string
  rate: number
  price?: string | number
}

export interface RawHaravanLineItem {
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
  tax_lines?: RawHaravanTaxLine[] | null
}

export interface RawHaravanShippingLine {
  price?: string | number
}

/** Haravan always reports the shop's currency directly on the order. */
export interface RawHaravanOrder {
  id: number | string
  order_number?: number | string
  name?: string
  currency: string
  customer?: { id?: number | string } | null
  email?: string | null
  phone?: string | null
  subtotal_price?: string | number
  total_tax?: string | number
  total_discounts?: string | number
  shipping_lines?: RawHaravanShippingLine[]
  total_price?: string | number
  financial_status?: string | null
  fulfillment_status?: string | null
  line_items?: RawHaravanLineItem[]
  billing_address?: RawHaravanOrderAddress | null
  shipping_address?: RawHaravanOrderAddress | null
  /** Embedded in full on the Order payload — see index.ts's listRefunds/listTransactions. */
  refunds?: RawHaravanRefund[]
  transactions?: RawHaravanTransaction[]
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

function toNum(v: string | number | null | undefined): number | undefined {
  if (v == null) return undefined
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : undefined
}

function money(v: string | number | null | undefined, currency: string): { amount: number; currency: string } | undefined {
  const n = toNum(v)
  return n != null ? { amount: n, currency } : undefined
}

function mapAddress(raw: RawHaravanOrderAddress | null | undefined): Address | undefined {
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

function mapLineItem(raw: RawHaravanLineItem, currency: string): LineItem {
  const price = money(raw.price, currency)
  if (!price) {
    throw new Error(`Haravan line item ${String(raw.id)} has no price — cannot build a canonical LineItem without one.`)
  }
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId: raw.variant_id != null ? String(raw.variant_id) : undefined,
    title: raw.title,
    quantity: raw.quantity,
    price,
    totalDiscount: money(raw.total_discount, currency),
    taxLines: raw.tax_lines?.map((tl) => {
      const amount = money(tl.price, currency)
      if (!amount) {
        throw new Error(`Haravan tax line "${tl.title}" on line item ${String(raw.id)} has no price.`)
      }
      return { title: tl.title, rate: tl.rate, amount }
    }),
    sku: raw.sku ?? undefined,
    fulfillableQuantity: raw.fulfillable_quantity,
    fulfillmentStatus: raw.fulfillment_status ? FUL_STATUS_MAP[raw.fulfillment_status] ?? undefined : undefined,
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

export function transformOrder(raw: RawHaravanOrder): Order {
  const currency = raw.currency
  const shippingTotal = raw.shipping_lines?.length
    ? raw.shipping_lines.reduce((sum, l) => sum + (toNum(l.price) ?? 0), 0)
    : undefined

  return {
    id: String(raw.id),
    orderNumber: raw.order_number != null ? String(raw.order_number) : undefined,
    name: raw.name,
    customerId: raw.customer?.id != null ? String(raw.customer.id) : undefined,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    currency,
    subtotalPrice: money(raw.subtotal_price, currency),
    totalTax: money(raw.total_tax, currency),
    totalDiscounts: money(raw.total_discounts, currency),
    totalShipping: shippingTotal != null ? { amount: shippingTotal, currency } : undefined,
    totalPrice: money(raw.total_price, currency),
    financialStatus: raw.financial_status ? FIN_STATUS_MAP[raw.financial_status] ?? undefined : undefined,
    fulfillmentStatus: raw.fulfillment_status ? FUL_STATUS_MAP[raw.fulfillment_status] ?? undefined : undefined,
    lineItems: (raw.line_items ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
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

/** Canonical Order → Haravan order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: order.email,
    phone: order.phone,
    note: order.note,
  }
  if (order.tags) body.tags = order.tags.join(', ')
  if (order.lineItems) {
    body.line_items = order.lineItems.map((li) => ({
      variant_id: li.variantId,
      quantity: li.quantity,
      price: li.price?.amount,
      title: li.title,
      sku: li.sku,
    }))
  }
  return body
}
