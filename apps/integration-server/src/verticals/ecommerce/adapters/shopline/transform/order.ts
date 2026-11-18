/**
 * SHOPLINE Order → canonical Order.
 *
 * SHOPLINE's order object closely mirrors Shopify's shape: same field names
 * for financial_status, fulfillment_status, line_items, addresses, etc.
 * Notable differences:
 *  - Tags may be a string or an array.
 *  - `buyer_id` replaces `customer.id` in some response versions; we read both.
 *  - Shipping price may be in `total_shipping_price` (string) or nested in
 *    `total_shipping_price_set.shop_money`.
 *
 * Docs: https://developer.shopline.com/docs/admin-rest-api/order/order-management/get-orders/
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw SHOPLINE shapes ───────────────────────────────────────────────────────

export interface RawShoplineOrderAddress {
  address1?: string | null
  address2?: string | null
  city?: string | null
  province?: string | null
  province_code?: string | null
  zip?: string | null
  country?: string | null
  country_code?: string | null
}

export interface RawShoplineLineItemTaxLine {
  title?: string
  rate?: number
  price?: string | number
}

export interface RawShoplineLineItem {
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
  tax_lines?: RawShoplineLineItemTaxLine[]
  [key: string]: unknown
}

export interface RawShoplineMoneySet {
  shop_money?: { amount: string | number; currency_code: string }
  presentment_money?: { amount: string | number; currency_code: string }
}

export interface RawShoplineOrder {
  id: number | string
  order_number?: number | string
  name?: string
  customer?: { id?: number | string } | null
  buyer_id?: number | string | null
  email?: string | null
  phone?: string | null
  currency?: string
  subtotal_price?: string | number
  total_tax?: string | number
  total_discounts?: string | number
  total_shipping_price?: string | number
  total_shipping_price_set?: RawShoplineMoneySet
  total_price?: string | number
  financial_status?: string | null
  fulfillment_status?: string | null
  line_items?: RawShoplineLineItem[]
  billing_address?: RawShoplineOrderAddress | null
  shipping_address?: RawShoplineOrderAddress | null
  fulfillments?: Array<{ id: number | string }>
  refunds?: Array<{ id: number | string }>
  transactions?: Array<{ id: number | string }>
  discount_codes?: Array<{ code: string } | string>
  tags?: string | string[]
  note?: string | null
  created_at?: string
  updated_at?: string
  processed_at?: string | null
  cancelled_at?: string | null
  cancel_reason?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function toMinor(v: string | number | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

function mapAddress(raw: RawShoplineOrderAddress | null | undefined): Address | undefined {
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

function mapLineItem(raw: RawShoplineLineItem, currency: string): LineItem {
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
      title: tl.title ?? '',
      rate: tl.rate ?? 0,
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

function resolveShipping(
  raw: RawShoplineOrder,
  currency: string,
): { amount: number; currency: string } | undefined {
  // Prefer nested money set; fall back to flat total_shipping_price
  const set = raw.total_shipping_price_set?.shop_money
  if (set) {
    return { amount: toMinor(set.amount, set.currency_code), currency: set.currency_code }
  }
  if (raw.total_shipping_price != null) {
    return { amount: toMinor(raw.total_shipping_price, currency), currency }
  }
  return undefined
}

function splitTags(tags: string | string[] | undefined): string[] | undefined {
  if (!tags) return undefined
  if (Array.isArray(tags)) return tags.filter((t) => t.length > 0)
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

function resolveDiscountCodes(
  raw: Array<{ code: string } | string> | undefined,
): string[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((d) => (typeof d === 'string' ? d : d.code))
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawShoplineOrder): Order {
  const currency = raw.currency ?? 'USD'
  const money = (v: string | number | null | undefined) => ({
    amount: toMinor(v, currency),
    currency,
  })

  // SHOPLINE may use `buyer_id` or `customer.id`
  const customerId =
    raw.customer?.id != null
      ? String(raw.customer.id)
      : raw.buyer_id != null
        ? String(raw.buyer_id)
        : undefined

  return {
    id: String(raw.id),
    orderNumber: raw.order_number != null ? String(raw.order_number) : undefined,
    name: raw.name,
    customerId,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    currency,
    subtotalPrice: raw.subtotal_price != null ? money(raw.subtotal_price) : undefined,
    totalTax: raw.total_tax != null ? money(raw.total_tax) : undefined,
    totalDiscounts: raw.total_discounts != null ? money(raw.total_discounts) : undefined,
    totalShipping: resolveShipping(raw, currency),
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
    discountCodes: resolveDiscountCodes(raw.discount_codes),
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

/** Canonical Order → SHOPLINE order body (for create). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    email: order.email,
    phone: order.phone,
    currency: order.currency,
    note: order.note,
    tags: Array.isArray(order.tags) ? order.tags.join(',') : order.tags,
    line_items: order.lineItems?.map((li) => ({
      variant_id: li.variantId,
      quantity: li.quantity,
      price: li.price != null
        ? String(minorToMajor(li.price.amount, li.price.currency) ?? 0)
        : undefined,
      title: li.title,
      sku: li.sku,
    })),
  }
}
