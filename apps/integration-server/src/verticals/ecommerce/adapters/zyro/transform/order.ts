/**
 * Zyro Order → canonical Order.
 *
 * Zyro order objects contain buyer contact info, a `line_items` array, address
 * fields, and payment/fulfillment status strings. All money values are plain
 * numbers (not strings) in the store's default currency.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Zyro shapes ─────────────────────────────────────────────────────────

export interface RawZyroAddress {
  address1?: string
  address2?: string
  street?: string
  city?: string
  province?: string
  province_code?: string
  state?: string
  zip?: string
  postal_code?: string
  country?: string
  country_code?: string
  [key: string]: unknown
}

export interface RawZyroTaxLine {
  title?: string
  rate?: number
  price?: number | string
  [key: string]: unknown
}

export interface RawZyroLineItem {
  id?: string
  product_id?: string
  variant_id?: string
  title?: string
  name?: string
  quantity?: number
  price?: number | string
  total_discount?: number | string
  sku?: string
  fulfillable_quantity?: number
  fulfillment_status?: string
  tax_lines?: RawZyroTaxLine[]
  [key: string]: unknown
}

export interface RawZyroOrder {
  id?: string
  order_number?: number | string
  name?: string
  customer_id?: string
  email?: string
  phone?: string
  currency?: string
  subtotal_price?: number | string
  total_tax?: number | string
  total_discounts?: number | string
  total_shipping?: number | string
  shipping_price?: number | string
  total_price?: number | string
  financial_status?: string
  payment_status?: string
  fulfillment_status?: string
  line_items?: RawZyroLineItem[]
  billing_address?: RawZyroAddress
  shipping_address?: RawZyroAddress
  fulfillment_ids?: string[]
  refund_ids?: string[]
  transaction_ids?: string[]
  discount_codes?: string[]
  tags?: string[]
  note?: string
  created_at?: string
  updated_at?: string
  processed_at?: string
  cancelled_at?: string
  cancel_reason?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  return parseFloat(v) || 0
}

function toMoney(
  v: number | string | null | undefined,
  currency: string,
) {
  if (v == null) return undefined
  const amount = majorToMinor(toNum(v), currency)
  return { amount, currency }
}

function mapAddress(raw: RawZyroAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? raw.street ?? undefined
  const line2 = raw.address2 || undefined
  const city = raw.city || undefined
  const region = raw.province ?? raw.province_code ?? raw.state ?? undefined
  const postalCode = raw.zip ?? raw.postal_code ?? undefined
  const country = raw.country_code ?? raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

const FINANCIAL_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  pending: 'PENDING',
  authorized: 'AUTHORIZED',
  partially_paid: 'PARTIALLY_PAID',
  paid: 'PAID',
  partially_refunded: 'PARTIALLY_REFUNDED',
  refunded: 'REFUNDED',
  voided: 'VOIDED',
  // alternative casing
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  REFUNDED: 'REFUNDED',
  VOIDED: 'VOIDED',
}

const FULFILLMENT_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  unfulfilled: 'UNFULFILLED',
  partial: 'PARTIAL',
  fulfilled: 'FULFILLED',
  restocked: 'RESTOCKED',
  UNFULFILLED: 'UNFULFILLED',
  PARTIAL: 'PARTIAL',
  FULFILLED: 'FULFILLED',
  RESTOCKED: 'RESTOCKED',
}

function mapLineItem(raw: RawZyroLineItem, currency: string): LineItem {
  return {
    id: String(raw.id ?? ''),
    productId: raw.product_id ? String(raw.product_id) : undefined,
    variantId: raw.variant_id ? String(raw.variant_id) : undefined,
    title: raw.title ?? raw.name ?? '',
    quantity: raw.quantity ?? 0,
    price: { amount: majorToMinor(toNum(raw.price), currency), currency },
    totalDiscount:
      raw.total_discount != null
        ? { amount: majorToMinor(toNum(raw.total_discount), currency), currency }
        : undefined,
    sku: raw.sku || undefined,
    fulfillableQuantity: raw.fulfillable_quantity,
    fulfillmentStatus: raw.fulfillment_status
      ? FULFILLMENT_STATUS_MAP[raw.fulfillment_status]
      : undefined,
    taxLines: raw.tax_lines?.map((tl) => ({
      title: tl.title ?? '',
      rate: tl.rate ?? 0,
      amount: { amount: majorToMinor(toNum(tl.price), currency), currency },
    })),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformOrder(raw: RawZyroOrder): Order {
  const currency = raw.currency ?? 'USD'

  // financial_status takes precedence over payment_status
  const rawFinancial = raw.financial_status ?? raw.payment_status
  const rawFulfillment = raw.fulfillment_status

  // total_shipping may be stored under different keys
  const shippingAmount = raw.total_shipping ?? raw.shipping_price

  return {
    id: String(raw.id ?? ''),
    orderNumber:
      raw.order_number != null ? String(raw.order_number) : undefined,
    name: raw.name || undefined,
    customerId: raw.customer_id ? String(raw.customer_id) : undefined,
    email: raw.email || undefined,
    phone: raw.phone || undefined,
    currency,
    subtotalPrice: toMoney(raw.subtotal_price, currency),
    totalTax: toMoney(raw.total_tax, currency),
    totalDiscounts: toMoney(raw.total_discounts, currency),
    totalShipping: toMoney(shippingAmount, currency),
    totalPrice: toMoney(raw.total_price, currency),
    financialStatus: rawFinancial
      ? (FINANCIAL_STATUS_MAP[rawFinancial] ?? undefined)
      : undefined,
    fulfillmentStatus: rawFulfillment
      ? (FULFILLMENT_STATUS_MAP[rawFulfillment] ?? undefined)
      : undefined,
    lineItems: (raw.line_items ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    fulfillmentIds: raw.fulfillment_ids?.filter(Boolean),
    refundIds: raw.refund_ids?.filter(Boolean),
    transactionIds: raw.transaction_ids?.filter(Boolean),
    discountCodes: raw.discount_codes?.filter(Boolean),
    tags: raw.tags && raw.tags.length > 0 ? raw.tags : undefined,
    note: raw.note || undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    processedAt: raw.processed_at,
    cancelledAt: raw.cancelled_at,
    cancelReason: raw.cancel_reason || undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
