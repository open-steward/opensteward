/**
 * EverShop Order → canonical Order.
 *
 * Maps EverShop's `payment_status`, `shipment_status` to canonical financial
 * and fulfillment status enums. Line items (`items`), addresses, and related
 * ids (shipments, coupons) are flattened onto the order.
 *
 * Money fields are decimal major units (e.g. `"19.99"`); canonical Money is
 * integer minor units (cents). `majorToMinor` handles the conversion.
 *
 * Docs: https://evershop.io/docs/api/order
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

// ── Raw EverShop shapes ───────────────────────────────────────────────────────

export interface RawEverShopAddress {
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  province?: string | null
  country?: string | null
  postcode?: string | null
  telephone?: string | null
  full_name?: string | null
  [key: string]: unknown
}

export interface RawEverShopOrderItem {
  order_item_id?: number | string
  uuid?: string
  product_id?: number | string | null
  variant_id?: number | string | null
  product_sku?: string | null
  product_name?: string
  qty?: number | string
  final_price?: number | string | null
  tax?: number | string | null
  discount_amount?: number | string | null
  [key: string]: unknown
}

export interface RawEverShopOrder {
  order_id?: number | string
  uuid?: string
  order_number?: string | number | null
  customer_id?: number | string | null
  customer_email?: string | null
  customer_full_name?: string | null
  currency?: string | null
  coupon?: string | null
  sub_total?: number | string | null
  tax_amount?: number | string | null
  discount_amount?: number | string | null
  shipping_fee_incl_tax?: number | string | null
  grand_total?: number | string | null
  payment_status?: string | null
  shipment_status?: string | null
  shipping_method?: string | null
  payment_method?: string | null
  items?: RawEverShopOrderItem[]
  shipping_address?: RawEverShopAddress | null
  billing_address?: RawEverShopAddress | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMinor(v: number | string | null | undefined, currency: string): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (!Number.isFinite(n)) return 0
  return majorToMinor(n, currency)
}

function mapAddress(raw: RawEverShopAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address_1 ?? undefined
  const city = raw.city ?? undefined
  const country = raw.country ?? undefined
  const postalCode = raw.postcode ?? undefined
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

/**
 * EverShop payment_status values: "pending", "paid", "refunded", "cancelled".
 */
const PAYMENT_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  pending: 'PENDING',
  paid: 'PAID',
  refunded: 'REFUNDED',
  cancelled: 'VOIDED',
  authorized: 'AUTHORIZED',
  partially_paid: 'PARTIALLY_PAID',
  partially_refunded: 'PARTIALLY_REFUNDED',
}

/**
 * EverShop shipment_status values: "not_shipped", "shipped", "delivered", "cancelled".
 */
const SHIPMENT_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  not_shipped: 'UNFULFILLED',
  shipped: 'FULFILLED',
  delivered: 'FULFILLED',
  partial: 'PARTIAL',
  cancelled: 'RESTOCKED',
}

function mapLineItem(raw: RawEverShopOrderItem, currency: string): LineItem {
  const id =
    raw.uuid ??
    (raw.order_item_id != null ? String(raw.order_item_id) : String(raw.product_name ?? ''))
  return {
    id,
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId: raw.variant_id != null ? String(raw.variant_id) : undefined,
    title: raw.product_name ?? '',
    quantity: raw.qty != null ? Number(raw.qty) : 0,
    price: { amount: toMinor(raw.final_price, currency), currency },
    totalDiscount:
      raw.discount_amount != null
        ? { amount: toMinor(raw.discount_amount, currency), currency }
        : undefined,
    sku: raw.product_sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawEverShopOrder): Order {
  const id = raw.uuid ?? (raw.order_id != null ? String(raw.order_id) : String(raw.order_number ?? ''))
  const currency = raw.currency ?? 'USD'
  const money = (v: number | string | null | undefined) => ({
    amount: toMinor(v, currency),
    currency,
  })

  const financialStatus = raw.payment_status
    ? PAYMENT_STATUS_MAP[raw.payment_status] ?? undefined
    : undefined
  const fulfillmentStatus = raw.shipment_status
    ? SHIPMENT_STATUS_MAP[raw.shipment_status] ?? undefined
    : undefined

  return {
    id,
    orderNumber: raw.order_number != null ? String(raw.order_number) : undefined,
    name: raw.order_number != null ? `#${raw.order_number}` : undefined,
    customerId: raw.customer_id != null ? String(raw.customer_id) : undefined,
    email: raw.customer_email ?? undefined,
    currency,
    subtotalPrice: raw.sub_total != null ? money(raw.sub_total) : undefined,
    totalTax: raw.tax_amount != null ? money(raw.tax_amount) : undefined,
    totalDiscounts: raw.discount_amount != null ? money(raw.discount_amount) : undefined,
    totalShipping: raw.shipping_fee_incl_tax != null ? money(raw.shipping_fee_incl_tax) : undefined,
    totalPrice: raw.grand_total != null ? money(raw.grand_total) : undefined,
    financialStatus,
    fulfillmentStatus,
    lineItems: (raw.items ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    discountCodes: raw.coupon ? [raw.coupon] : undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → EverShop order body (EverShop creates orders from carts). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  // EverShop creates orders via POST /api/orders with a cart_id.
  // For updates the caller should supply metadata with the relevant fields.
  return {
    customer_email: order.email,
    currency: order.currency,
  }
}
