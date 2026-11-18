/**
 * Sapo Order → canonical Order.
 *
 * Maps Sapo's `financial_status` and `fulfillment_status` strings to the
 * canonical UPPER_SNAKE enums. Sapo uses different timestamp field names:
 *  - `created_on`   (Shopify: `created_at`)
 *  - `modified_on`  (Shopify: `updated_at`)
 *  - `processed_on` (Shopify: `processed_at`)
 *  - `cancelled_on` (Shopify: `cancelled_at`)
 *
 * Line items, addresses, fulfillments, refunds, and transactions are
 * structured the same as Shopify.
 *
 * Docs: https://support.sapo.vn/cac-thuoc-tinh-cua-order-api
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawSapoOrderAddress {
  address1?: string | null
  address2?: string | null
  city?: string | null
  province?: string | null
  province_code?: string | null
  zip?: string | null
  country?: string | null
  country_code?: string | null
}

export interface RawSapoTaxLine {
  title: string
  rate: number
  price?: string | number
}

export interface RawSapoLineItem {
  id: number | string
  product_id?: number | string | null
  variant_id?: number | string | null
  title: string
  name?: string
  quantity: number
  price?: string | number
  total_discount?: string | number
  sku?: string | null
  fulfillable_quantity?: number
  fulfillment_status?: string | null
  tax_lines?: RawSapoTaxLine[]
  [key: string]: unknown
}

export interface RawSapoOrder {
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
  total_shipping?: string | number
  total_price?: string | number
  financial_status?: string | null
  fulfillment_status?: string | null
  line_items?: RawSapoLineItem[]
  billing_address?: RawSapoOrderAddress | null
  shipping_address?: RawSapoOrderAddress | null
  fulfillments?: Array<{ id: number | string }>
  refunds?: Array<{ id: number | string }>
  transactions?: Array<{ id: number | string }>
  discount_codes?: Array<{ code: string }>
  tags?: string
  note?: string | null
  /** Sapo: `created_on` */
  created_on?: string
  /** Sapo: `modified_on` */
  modified_on?: string
  /** Sapo: `processed_on` */
  processed_on?: string | null
  /** Sapo: `cancelled_on` */
  cancelled_on?: string | null
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

function mapAddress(raw: RawSapoOrderAddress | null | undefined): Address | undefined {
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
  unpaid: 'PENDING',
}

const FUL_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  unfulfilled: 'UNFULFILLED',
  partial: 'PARTIAL',
  fulfilled: 'FULFILLED',
}

function mapLineItem(raw: RawSapoLineItem, currency: string): LineItem {
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId: raw.variant_id != null ? String(raw.variant_id) : undefined,
    title: raw.title ?? raw.name ?? '',
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

export function transformOrder(raw: RawSapoOrder): Order {
  const currency = raw.currency ?? 'VND'
  const money = (v: string | number | null | undefined) => ({ amount: toMinor(v, currency), currency })

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
    totalShipping: raw.total_shipping != null ? money(raw.total_shipping) : undefined,
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
    createdAt: raw.created_on,
    updatedAt: raw.modified_on,
    processedAt: raw.processed_on ?? undefined,
    cancelledAt: raw.cancelled_on ?? undefined,
    cancelReason: raw.cancel_reason ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Sapo order body (for create/update). */
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
