/**
 * CS-Cart Order → canonical Order.
 *
 * CS-Cart stores a single `status` character code covering both financial and
 * fulfillment state. The split into canonical pair follows this mapping:
 *
 *   O = Open         → {PENDING,          UNFULFILLED}
 *   N = New          → {PENDING,          UNFULFILLED}
 *   P = Processed    → {PAID,             UNFULFILLED}
 *   C = Complete     → {PAID,             FULFILLED}
 *   F = Failed       → {VOIDED,           UNFULFILLED}
 *   D = Declined     → {VOIDED,           UNFULFILLED}
 *   B = Backordered  → {PARTIALLY_PAID,   UNFULFILLED}
 *   I = Incomplete   → {PENDING,          UNFULFILLED}
 *
 * Addresses live as flat fields prefixed `b_` (billing) and `s_` (shipping).
 * Order items are embedded under `products[]`.
 * The `timestamp` field is a Unix epoch integer.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw CS-Cart shapes ───────────────────────────────────────────────────────

export interface CsCartOrderProduct {
  item_id?: number | string
  product_id?: number | string
  product?: string
  amount?: number | string
  price?: string | number
  product_code?: string | null
  [key: string]: unknown
}

export interface CsCartOrder {
  order_id: number | string
  status?: string
  total?: string | number
  subtotal?: string | number
  subtotal_discount?: string | number
  shipping_cost?: string | number
  tax_subtotal?: string | number
  currency?: string
  user_id?: number | string
  email?: string
  firstname?: string
  lastname?: string
  phone?: string
  // Billing address
  b_firstname?: string | null
  b_lastname?: string | null
  b_address?: string | null
  b_address_2?: string | null
  b_city?: string | null
  b_state?: string | null
  b_zipcode?: string | null
  b_country?: string | null
  // Shipping address
  s_firstname?: string | null
  s_lastname?: string | null
  s_address?: string | null
  s_address_2?: string | null
  s_city?: string | null
  s_state?: string | null
  s_zipcode?: string | null
  s_country?: string | null
  // Line items
  products?: CsCartOrderProduct[]
  // Notes
  notes?: string | null
  details?: string | null
  // Timestamps (Unix epoch)
  timestamp?: number | string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function tsToIso(ts: number | string | null | undefined): string | undefined {
  if (ts == null) return undefined
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts
  if (!n || Number.isNaN(n)) return undefined
  return new Date(n * 1000).toISOString()
}

function mapStatuses(status: string | undefined): {
  financialStatus?: OrderFinancialStatus
  fulfillmentStatus?: OrderFulfillmentStatus
} {
  if (!status) return {}
  switch (status.toUpperCase()) {
    case 'O':
    case 'N':
    case 'I':
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 'P':
      return { financialStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED' }
    case 'C':
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 'F':
    case 'D':
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    case 'B':
      return { financialStatus: 'PARTIALLY_PAID', fulfillmentStatus: 'UNFULFILLED' }
    default:
      return {}
  }
}

function mapAddress(
  prefix: 's' | 'b',
  raw: CsCartOrder,
): Address | undefined {
  const line1 = raw[`${prefix}_address`] as string | null | undefined
  const line2 = raw[`${prefix}_address_2`] as string | null | undefined
  const city = raw[`${prefix}_city`] as string | null | undefined
  const region = raw[`${prefix}_state`] as string | null | undefined
  const postalCode = raw[`${prefix}_zipcode`] as string | null | undefined
  const country = raw[`${prefix}_country`] as string | null | undefined

  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1: line1 ?? undefined,
    line2: line2 ?? undefined,
    city: city ?? undefined,
    region: region ?? undefined,
    postalCode: postalCode ?? undefined,
    country: country ?? undefined,
  }
}

function mapLineItem(raw: CsCartOrderProduct, currency: string): LineItem {
  const qty = toNum(raw.amount) || 1
  const unitPrice = majorToMinor(toNum(raw.price), currency)
  return {
    id: raw.item_id != null ? String(raw.item_id) : String(raw.product_id ?? ''),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    title: raw.product ?? '',
    quantity: qty,
    price: { amount: unitPrice, currency },
    sku: raw.product_code ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

export function transformOrder(raw: CsCartOrder): Order {
  const currency = (raw.currency as string | undefined) ?? 'USD'
  const money = (v: string | number | null | undefined) => ({
    amount: majorToMinor(toNum(v), currency),
    currency,
  })
  const { financialStatus, fulfillmentStatus } = mapStatuses(raw.status)
  const orderId = String(raw.order_id)

  return {
    id: orderId,
    orderNumber: orderId,
    name: `#${orderId}`,
    customerId:
      raw.user_id != null && raw.user_id !== 0
        ? String(raw.user_id)
        : undefined,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    currency,
    subtotalPrice: raw.subtotal != null ? money(raw.subtotal) : undefined,
    totalTax: raw.tax_subtotal != null ? money(raw.tax_subtotal) : undefined,
    totalDiscounts: raw.subtotal_discount != null ? money(raw.subtotal_discount) : undefined,
    totalShipping: raw.shipping_cost != null ? money(raw.shipping_cost) : undefined,
    totalPrice: raw.total != null ? money(raw.total) : undefined,
    financialStatus,
    fulfillmentStatus,
    lineItems: (raw.products ?? []).map((p) => mapLineItem(p, currency)),
    billingAddress: mapAddress('b', raw),
    shippingAddress: mapAddress('s', raw),
    note: raw.notes ?? raw.details ?? undefined,
    createdAt: tsToIso(raw.timestamp),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order (partial) → CS-Cart order body (for status update). */
export function untransformOrderStatus(status: string): Record<string, unknown> {
  return { status }
}
