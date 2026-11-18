/**
 * Shopify Order → canonical Order.
 *
 * Maps Shopify's `financial_status` and `fulfillment_status` strings to the
 * canonical UPPER_SNAKE enums. Line items, addresses, and referenced ids
 * (fulfillments, refunds, transactions) are flattened onto the order.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import type { RawShopifyFulfillment } from './fulfillment'
import type { RawShopifyRefund } from './refund'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawShopifyOrderAddress {
  address1?: string | null
  address2?: string | null
  city?: string | null
  province?: string | null
  province_code?: string | null
  zip?: string | null
  country?: string | null
  country_code?: string | null
}

export interface RawShopifyLineItem {
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
  tax_lines?: RawShopifyTaxLine[]
}

export interface RawShopifyTaxLine {
  title: string
  rate: number
  price?: string | number
}

export interface RawShopifyMoneySet {
  shop_money?: { amount: string | number; currency_code: string }
  presentment_money?: { amount: string | number; currency_code: string }
}

export interface RawShopifyOrder {
  id: number | string
  order_number?: number | string
  name?: string
  customer?: { id?: number | string } | null
  email?: string | null
  phone?: string | null
  currency?: string
  subtotal_price?: string | number
  total_tax?: string | number
  total_discounts?: string | number
  total_shipping_price_set?: RawShopifyMoneySet
  total_price?: string | number
  financial_status?: string | null
  fulfillment_status?: string | null
  line_items?: RawShopifyLineItem[]
  billing_address?: RawShopifyOrderAddress | null
  shipping_address?: RawShopifyOrderAddress | null
  /**
   * Embedded in full on the Order payload. The store-wide fulfillments and
   * refunds lists (`listFulfillments` / `listRefunds` without an order) are
   * flattened from these, so the shapes are the real ones, not id stubs.
   */
  fulfillments?: RawShopifyFulfillment[]
  refunds?: RawShopifyRefund[]
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

/** Parse a Shopify decimal major-unit value to integer minor units. */
function toMinor(v: string | number | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

function mapAddress(raw: RawShopifyOrderAddress | null | undefined): Address | undefined {
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

function mapLineItem(raw: RawShopifyLineItem, currency: string): LineItem {
  const item: LineItem = {
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
  return item
}

function moneyFromSet(
  set: RawShopifyMoneySet | undefined,
): { amount: number; currency: string } | undefined {
  const m = set?.shop_money
  if (!m) return undefined
  return { amount: toMinor(m.amount, m.currency_code), currency: m.currency_code }
}

function splitTags(tags: string | undefined): string[] | undefined {
  if (!tags) return undefined
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawShopifyOrder): Order {
  const currency = raw.currency ?? 'USD'
  const money = (v: string | number | null | undefined) => ({ amount: toMinor(v, currency), currency })
  const shipping = moneyFromSet(raw.total_shipping_price_set)

  return {
    id: String(raw.id),
    orderNumber: raw.order_number != null ? String(raw.order_number) : undefined,
    name: raw.name,
    customerId: raw.customer?.id != null ? String(raw.customer.id) : undefined,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    currency,
    subtotalPrice: raw.subtotal_price != null ? money(raw.subtotal_price) : undefined,
    totalTax: raw.total_tax != null ? money(raw.total_tax) : undefined,
    totalDiscounts: raw.total_discounts != null ? money(raw.total_discounts) : undefined,
    totalShipping: shipping,
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

/** Canonical Order → Shopify order body (for create/update). */
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
