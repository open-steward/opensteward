/**
 * Zid Order → canonical Order.
 *
 * Zid's /v1/managers/store/orders endpoint wraps orders in:
 *   { orders: [...], total_order_count: N }
 *
 * Each order object has:
 *   - id, invoice_number, code, currency_code
 *   - order_status: { code: "new"|"preparing"|"ready"|"indelivery"|"delivered"|"canceled" }
 *   - payment_status: "pending"|"paid"|"refunded"|"voided"
 *   - customer: { id, name, email, mobile }
 *   - products: [{ id, name, sku, quantity, price, total, ... }]
 *   - shipping: { address: {...}, method: {...} }
 *   - payment: { invoice: [...], method }
 *   - order_total (decimal string, major-unit)
 *   - coupon: { code: "..." } | null
 *   - created_at, updated_at
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Zid shapes ────────────────────────────────────────────────────────────

export interface RawZidOrderStatus {
  code?: string | null
  name?: string | null
}

export interface RawZidOrderCustomer {
  id?: number | string
  name?: string | null
  email?: string | null
  mobile?: string | null
}

export interface RawZidOrderProduct {
  id?: number | string
  name?: string | null
  sku?: string | null
  quantity?: number
  price?: number | string
  total?: number | string
  tax_percentage?: number
  tax_amount?: number | string
  images?: Array<{ url?: string; src?: string }>
  [key: string]: unknown
}

export interface RawZidShippingAddress {
  line_1?: string | null
  line_2?: string | null
  city_name?: string | null
  country_code?: string | null
  postcode?: string | null
  [key: string]: unknown
}

export interface RawZidShipping {
  address?: RawZidShippingAddress | null
  method?: { name?: string; id?: number | string } | null
  tracking_number?: string | null
  tracking_url?: string | null
}

export interface RawZidPaymentInvoiceItem {
  name?: string | null
  value?: number | string
}

export interface RawZidPayment {
  method?: { name?: string; code?: string } | null
  invoice?: RawZidPaymentInvoiceItem[]
}

export interface RawZidOrder {
  id?: number | string
  invoice_number?: number | string
  code?: string | null
  store_id?: number | string
  store_name?: string | null
  currency_code?: string
  order_status?: RawZidOrderStatus | null
  payment_status?: string | null
  customer?: RawZidOrderCustomer | null
  products?: RawZidOrderProduct[]
  shipping?: RawZidShipping | null
  payment?: RawZidPayment | null
  order_total?: number | string
  coupon?: { code?: string | null } | null
  issue_date?: string | null
  created_at?: string
  updated_at?: string
  source?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function money(v: number | string | null | undefined, currency: string) {
  return { amount: majorToMinor(toNum(v), currency), currency }
}

/**
 * Map Zid order_status.code → canonical OrderFulfillmentStatus.
 *
 * Zid statuses: new, preparing, ready, indelivery, delivered, canceled
 */
const FULFILLMENT_MAP: Record<string, OrderFulfillmentStatus> = {
  new: 'UNFULFILLED',
  preparing: 'PARTIAL',
  ready: 'PARTIAL',
  indelivery: 'PARTIAL',
  delivered: 'FULFILLED',
  cancelled: 'RESTOCKED',
  canceled: 'RESTOCKED',
}

/**
 * Map Zid payment_status → canonical OrderFinancialStatus.
 *
 * Zid statuses: pending, paid, refunded, voided
 */
const FINANCIAL_MAP: Record<string, OrderFinancialStatus> = {
  pending: 'PENDING',
  paid: 'PAID',
  refunded: 'REFUNDED',
  voided: 'VOIDED',
}

function mapShippingAddress(addr: RawZidShippingAddress | null | undefined): Address | undefined {
  if (!addr) return undefined
  const line1 = addr.line_1 ?? undefined
  const city = addr.city_name ?? undefined
  const country = addr.country_code ?? undefined
  const postalCode = addr.postcode ?? undefined
  if (!line1 && !city && !country) return undefined
  return {
    line1,
    line2: addr.line_2 ?? undefined,
    city,
    country,
    postalCode,
  }
}

function mapLineItems(products: RawZidOrderProduct[] | undefined, currency: string): LineItem[] {
  if (!products || products.length === 0) return []
  return products.map((p) => ({
    id: String(p.id ?? ''),
    productId: p.id != null ? String(p.id) : undefined,
    title: p.name ?? '',
    quantity: p.quantity ?? 1,
    price: money(p.price, currency),
    sku: p.sku ?? undefined,
    metadata: p as unknown as Record<string, unknown>,
  }))
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawZidOrder): Order {
  const currency = raw.currency_code ?? 'SAR'
  const statusCode = raw.order_status?.code?.toLowerCase()

  return {
    id: String(raw.id ?? ''),
    orderNumber: raw.invoice_number != null ? String(raw.invoice_number) : undefined,
    name: raw.code ?? undefined,
    customerId: raw.customer?.id != null ? String(raw.customer.id) : undefined,
    email: raw.customer?.email ?? undefined,
    phone: raw.customer?.mobile ?? undefined,
    currency,
    totalPrice: raw.order_total != null ? money(raw.order_total, currency) : undefined,
    financialStatus: raw.payment_status
      ? FINANCIAL_MAP[raw.payment_status.toLowerCase()] ?? undefined
      : undefined,
    fulfillmentStatus: statusCode ? FULFILLMENT_MAP[statusCode] ?? undefined : undefined,
    lineItems: mapLineItems(raw.products, currency),
    shippingAddress: mapShippingAddress(raw.shipping?.address),
    discountCodes:
      raw.coupon?.code ? [raw.coupon.code] : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Zid draft order create body. */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    currency_code: order.currency,
    created_by: 'api',
    is_gift: false,
    is_gifted_consignee_notifiable: false,
    customer: {
      email: order.email,
      mobile_number: order.phone,
    },
    products: order.lineItems?.map((li) => ({
      sku: li.sku,
      quantity: li.quantity,
    })),
  }
}
