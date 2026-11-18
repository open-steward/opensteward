/**
 * Bagisto Order → canonical Order.
 *
 * Bagisto carries a single `status` field covering both financial and
 * fulfillment state. We split it into the canonical pair:
 *
 *   pending          → {PENDING,   UNFULFILLED}
 *   pending_payment  → {PENDING,   UNFULFILLED}
 *   processing       → {PAID,      UNFULFILLED}
 *   completed        → {PAID,      FULFILLED}
 *   canceled         → {VOIDED,    UNFULFILLED}
 *   closed           → {REFUNDED,  UNFULFILLED}
 *   fraud            → {VOIDED,    UNFULFILLED}
 *
 * Money fields are string-encoded (e.g. "59.98"). The order currency is
 * carried on the top-level `order_currency_code` field.
 *
 * Shipping and billing addresses are nested objects.
 * Line items live under `items[]`.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Bagisto shapes ────────────────────────────────────────────────────────

export interface BagistoAddress {
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  address1?: string | string[] | null
  address2?: string | null
  city?: string | null
  state?: string | null
  postcode?: string | null
  country?: string | null
  email?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface BagistoOrderItem {
  id: number | string
  sku?: string | null
  name: string
  type?: string
  product_id?: number | string | null
  product?: { id?: number | string } | null
  qty_ordered?: number
  qty_shipped?: number | null
  qty_invoiced?: number | null
  price?: string | number
  total?: string | number
  [key: string]: unknown
}

export interface BagistoOrder {
  id: number | string
  increment_id?: string | null
  status?: string | null
  grand_total?: string | number
  base_grand_total?: string | number
  sub_total?: string | number
  tax_amount?: string | number
  discount_amount?: string | number
  shipping_amount?: string | number
  currency_code?: string | null
  order_currency_code?: string | null
  customer_id?: number | string | null
  customer_email?: string | null
  customer_first_name?: string | null
  customer_last_name?: string | null
  customer_phone?: string | null
  items?: BagistoOrderItem[]
  billing_address?: BagistoAddress | null
  shipping_address?: BagistoAddress | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function resolveAddress1(raw: BagistoAddress | null | undefined): string | undefined {
  const a = raw?.address1
  if (!a) return undefined
  if (Array.isArray(a)) return a.filter(Boolean).join(', ') || undefined
  return a || undefined
}

function mapAddress(raw: BagistoAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = resolveAddress1(raw)
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.postcode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapStatuses(status: string | null | undefined): {
  financialStatus?: OrderFinancialStatus
  fulfillmentStatus?: OrderFulfillmentStatus
} {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':
    case 'pending_payment':
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 'processing':
      return { financialStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED' }
    case 'completed':
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 'canceled':
    case 'cancelled':
    case 'fraud':
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    case 'closed':
      return { financialStatus: 'REFUNDED', fulfillmentStatus: 'UNFULFILLED' }
    default:
      return {}
  }
}

function mapLineItem(raw: BagistoOrderItem, currency: string): LineItem {
  const qty = raw.qty_ordered ?? 1
  const total = toNum(raw.total)
  const unitPrice =
    raw.price != null ? toNum(raw.price) : qty > 0 ? total / qty : total

  const productId =
    raw.product_id != null
      ? String(raw.product_id)
      : raw.product?.id != null
        ? String(raw.product.id)
        : undefined

  return {
    id: String(raw.id),
    productId,
    title: raw.name,
    quantity: qty,
    price: { amount: majorToMinor(unitPrice, currency), currency },
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: BagistoOrder): Order {
  const currency = raw.order_currency_code ?? raw.currency_code ?? 'USD'
  const money = (v: string | number | null | undefined) => ({ amount: majorToMinor(toNum(v), currency), currency })
  const { financialStatus, fulfillmentStatus } = mapStatuses(raw.status)
  const orderId = String(raw.id)
  const orderNumber = raw.increment_id ?? undefined

  return {
    id: orderId,
    orderNumber,
    name: orderNumber != null ? `#${orderNumber}` : undefined,
    customerId:
      raw.customer_id != null && raw.customer_id !== 0
        ? String(raw.customer_id)
        : undefined,
    email: raw.customer_email ?? undefined,
    phone: raw.customer_phone ?? raw.billing_address?.phone ?? undefined,
    currency,
    subtotalPrice: raw.sub_total != null ? money(raw.sub_total) : undefined,
    totalTax: raw.tax_amount != null ? money(raw.tax_amount) : undefined,
    totalDiscounts:
      raw.discount_amount != null ? money(raw.discount_amount) : undefined,
    totalShipping:
      raw.shipping_amount != null ? money(raw.shipping_amount) : undefined,
    totalPrice:
      raw.grand_total != null ? money(raw.grand_total) : undefined,
    financialStatus,
    fulfillmentStatus,
    lineItems: (raw.items ?? []).map((item) => mapLineItem(item, currency)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    cancelledAt:
      raw.status === 'canceled' || raw.status === 'cancelled'
        ? raw.updated_at ?? undefined
        : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
