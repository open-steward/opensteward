/**
 * Recharge Order → canonical Order.
 *
 * Recharge has two distinct order-like resources:
 *  - Orders  (`/orders`): fulfilled subscription orders; have financial_status
 *    and fulfillment_status fields.
 *  - Charges (`/charges`): subscription billing events; have a `status` field.
 *
 * This transform handles the `/orders` endpoint shape, which is the canonical
 * ecommerce Order analogue. The raw `status`, `financial_status`, and
 * `fulfillment_status` fields are mapped to canonical enums.
 *
 * Money fields are string-encoded decimal major units (e.g. "19.99").
 * All addresses use { address1, address2, city, province, zip, country_code }.
 *
 * Docs: https://developer.rechargepayments.com/2021-11/orders/orders_object
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

// ── Raw Recharge shapes ──────────────────────────────────────────────────────

export interface RawRechargeOrderAddress {
  address1?: string | null
  address2?: string | null
  city?: string | null
  company?: string | null
  country_code?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  province?: string | null
  zip?: string | null
}

export interface RawRechargeLineItemTaxLine {
  price?: string | number | null
  rate?: string | number | null
  title?: string | null
}

export interface RawRechargeLineItem {
  purchase_item_id?: number | string | null
  external_product_id?: { ecommerce?: string | null } | null
  external_variant_id?: { ecommerce?: string | null } | null
  quantity?: number | null
  unit_price?: string | number | null
  total_price?: string | number | null
  sku?: string | null
  title?: string | null
  variant_title?: string | null
  grams?: number | null
  taxable?: boolean | null
  tax_lines?: RawRechargeLineItemTaxLine[] | null
  images?: Record<string, unknown> | null
  properties?: Array<{ name: string; value: unknown }> | null
  [key: string]: unknown
}

export interface RawRechargeOrder {
  id: number | string
  customer_id?: number | string | null
  charge_id?: number | string | null
  address_id?: number | string | null
  status?: string | null
  financial_status?: string | null
  fulfillment_status?: string | null
  currency?: string | null
  total_price?: string | number | null
  subtotal_price?: string | number | null
  total_tax?: string | number | null
  total_discounts?: string | number | null
  total_weight_grams?: number | null
  line_items?: RawRechargeLineItem[] | null
  billing_address?: RawRechargeOrderAddress | null
  shipping_address?: RawRechargeOrderAddress | null
  created_at?: string | null
  updated_at?: string | null
  processed_at?: string | null
  scheduled_at?: string | null
  shipped_date?: string | null
  tracking_number?: string | null
  note?: string | null
  tags?: string | null
  type?: string | null
  discount_codes?: Array<{ code: string; amount?: string | number; type?: string }> | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapAddress(raw: RawRechargeOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.province ?? undefined
  const postalCode = raw.zip ?? undefined
  const country = raw.country_code ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapFinancialStatus(raw: string | null | undefined): OrderFinancialStatus | undefined {
  if (!raw) return undefined
  switch (raw.toLowerCase()) {
    case 'success':
      return 'PAID'
    case 'pending':
      return 'PENDING'
    case 'error':
    case 'failure':
      return 'VOIDED'
    case 'refunded':
      return 'REFUNDED'
    case 'partially_refunded':
      return 'PARTIALLY_REFUNDED'
    default:
      return undefined
  }
}

function mapFulfillmentStatus(raw: string | null | undefined): OrderFulfillmentStatus | undefined {
  if (!raw) return undefined
  switch (raw.toLowerCase()) {
    case 'fulfilled':
    case 'success':
      return 'FULFILLED'
    case 'unfulfilled':
    case 'pending':
      return 'UNFULFILLED'
    case 'partial':
      return 'PARTIAL'
    default:
      return undefined
  }
}

function mapLineItem(raw: RawRechargeLineItem, currency: string, orderId: string, index: number): LineItem {
  const qty = raw.quantity != null && raw.quantity > 0 ? raw.quantity : 1
  const unitPriceMajor = toNum(raw.unit_price)
  const unitPrice = majorToMinor(unitPriceMajor, currency)

  return {
    id: raw.purchase_item_id != null ? String(raw.purchase_item_id) : `${orderId}:li:${index}`,
    productId: raw.external_product_id?.ecommerce ?? undefined,
    variantId: raw.external_variant_id?.ecommerce ?? undefined,
    title: raw.title ?? raw.variant_title ?? '',
    quantity: qty,
    price: { amount: unitPrice, currency },
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawRechargeOrder): Order {
  const currency = raw.currency ?? 'USD'
  const money = (v: string | number | null | undefined) => ({
    amount: majorToMinor(toNum(v), currency),
    currency,
  })

  const financialStatus =
    mapFinancialStatus(raw.financial_status) ?? mapFinancialStatus(raw.status)
  const fulfillmentStatus = mapFulfillmentStatus(raw.fulfillment_status)

  const tags = raw.tags
    ? raw.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined

  return {
    id: String(raw.id),
    orderNumber: String(raw.id),
    customerId: raw.customer_id != null ? String(raw.customer_id) : undefined,
    currency,
    subtotalPrice: raw.subtotal_price != null ? money(raw.subtotal_price) : undefined,
    totalTax: raw.total_tax != null ? money(raw.total_tax) : undefined,
    totalDiscounts: raw.total_discounts != null ? money(raw.total_discounts) : undefined,
    totalPrice: raw.total_price != null ? money(raw.total_price) : undefined,
    financialStatus,
    fulfillmentStatus,
    lineItems: (raw.line_items ?? []).map((li, idx) => mapLineItem(li, currency, String(raw.id), idx)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    discountCodes: raw.discount_codes?.map((d) => d.code),
    tags: tags && tags.length > 0 ? tags : undefined,
    note: raw.note ?? undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    processedAt: toIsoDatetime(raw.processed_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const billing = order.billingAddress
    ? {
        first_name: undefined,
        last_name: undefined,
        address1: order.billingAddress.line1,
        address2: order.billingAddress.line2,
        city: order.billingAddress.city,
        province: order.billingAddress.region,
        zip: order.billingAddress.postalCode,
        country_code: order.billingAddress.country,
        phone: order.phone,
      }
    : undefined

  const shipping = order.shippingAddress
    ? {
        address1: order.shippingAddress.line1,
        address2: order.shippingAddress.line2,
        city: order.shippingAddress.city,
        province: order.shippingAddress.region,
        zip: order.shippingAddress.postalCode,
        country_code: order.shippingAddress.country,
      }
    : undefined

  return {
    billing_address: billing,
    shipping_address: shipping,
    note: order.note,
    tags: order.tags?.join(', '),
  }
}
