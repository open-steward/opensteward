/**
 * Shuup Order → canonical Order.
 *
 * Shuup orders carry separate `payment_status` and `shipping_status` string
 * identifiers (e.g. `"fully_paid"`, `"fully_shipped"`). These are mapped to
 * canonical `financialStatus` / `fulfillmentStatus`.
 *
 * payment_status → financialStatus:
 *   fully_paid          → PAID
 *   partially_paid      → PARTIALLY_PAID
 *   not_paid / awaiting → PENDING
 *   refunded            → REFUNDED
 *   (other)             → PENDING
 *
 * shipping_status → fulfillmentStatus:
 *   fully_shipped       → FULFILLED
 *   partially_shipped   → PARTIAL
 *   not_shipped         → UNFULFILLED
 *   (other)             → UNFULFILLED
 *
 * Line items are embedded in the order as `lines[]`. Each line item may have
 * a `product` sub-object with an `id`.
 *
 * Addresses follow Shuup's `{ street`, `street2`, `city`, `region`, `postal_code`,
 * `country`, `phone` }` shape.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import type { ShuupTranslated } from './product'
import { pickTranslation } from './product'

// ── Raw Shuup shapes ─────────────────────────────────────────────────────────

export interface ShuupAddress {
  name?: string | null
  street?: string | null
  street2?: string | null
  city?: string | null
  region?: string | null
  postal_code?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

export interface ShuupOrderLine {
  id?: number | string
  product?: { id?: number | string } | null
  quantity?: string | number | null
  unit_price_value?: string | number | null
  /** Display name for the line (may be translated). */
  text?: ShuupTranslated
  sku?: string | null
  [key: string]: unknown
}

export interface ShuupOrderStatus {
  identifier?: string | null
  name?: ShuupTranslated
  [key: string]: unknown
}

export interface ShuupOrderCustomer {
  id?: number | string
  email?: string | null
  [key: string]: unknown
}

export interface ShuupOrder {
  id: number | string
  identifier?: string | null
  /** Nested status object. */
  status?: ShuupOrderStatus | string | null
  payment_status?: string | null
  shipping_status?: string | null
  total_price_value?: string | number | null
  taxful_total_price?: string | number | null
  currency?: string | null
  customer?: ShuupOrderCustomer | null
  lines?: ShuupOrderLine[]
  shipping_address?: ShuupAddress | null
  billing_address?: ShuupAddress | null
  order_date?: string | null
  created_on?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapFinancialStatus(
  paymentStatus: string | null | undefined,
): OrderFinancialStatus | undefined {
  if (!paymentStatus) return undefined
  switch (paymentStatus.toLowerCase()) {
    case 'fully_paid':
    case 'paid':
      return 'PAID'
    case 'partially_paid':
      return 'PARTIALLY_PAID'
    case 'not_paid':
    case 'awaiting_payment':
    case 'none':
      return 'PENDING'
    case 'refunded':
      return 'REFUNDED'
    case 'partially_refunded':
      return 'PARTIALLY_REFUNDED'
    case 'voided':
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'PENDING'
  }
}

function mapFulfillmentStatus(
  shippingStatus: string | null | undefined,
): OrderFulfillmentStatus | undefined {
  if (!shippingStatus) return undefined
  switch (shippingStatus.toLowerCase()) {
    case 'fully_shipped':
    case 'delivered':
      return 'FULFILLED'
    case 'partially_shipped':
      return 'PARTIAL'
    case 'not_shipped':
    case 'none':
      return 'UNFULFILLED'
    default:
      return 'UNFULFILLED'
  }
}

function mapAddress(raw: ShuupAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street ?? undefined
  const line2 = raw.street2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.region ?? undefined
  const postalCode = raw.postal_code ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function parseAmount(value: string | number | null | undefined): number {
  if (value == null) return 0
  if (typeof value === 'number') return value
  return parseFloat(value) || 0
}

function mapLineItem(raw: ShuupOrderLine, currency: string): LineItem {
  const title = raw.text ? pickTranslation(raw.text) : `Line ${raw.id ?? ''}`
  const quantity = typeof raw.quantity === 'string' ? parseFloat(raw.quantity) : (raw.quantity ?? 1)
  const price = parseAmount(raw.unit_price_value)

  return {
    id: raw.id != null ? String(raw.id) : `line-${Math.random()}`,
    productId: raw.product?.id != null ? String(raw.product.id) : undefined,
    title,
    quantity,
    price: { amount: majorToMinor(price, currency), currency },
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: ShuupOrder): Order {
  const currency = raw.currency ?? 'USD'
  const total = parseAmount(raw.total_price_value ?? raw.taxful_total_price)

  // status may be a nested object or a plain string identifier
  const statusIdentifier =
    raw.status && typeof raw.status === 'object'
      ? (raw.status as ShuupOrderStatus).identifier ?? undefined
      : (raw.status as string | null | undefined) ?? undefined

  const createdAt = raw.order_date ?? raw.created_on ?? undefined

  // Filter out shipping lines (type: 'shipping') from order lines
  const orderLines = (raw.lines ?? []).filter(
    (l) => (l as Record<string, unknown>)['type'] !== 'shipping',
  )

  return {
    id: String(raw.id),
    orderNumber: raw.identifier ?? undefined,
    name: raw.identifier ? `#${raw.identifier}` : `#${raw.id}`,
    customerId: raw.customer?.id != null ? String(raw.customer.id) : undefined,
    email: raw.customer?.email ?? undefined,
    currency,
    totalPrice: { amount: majorToMinor(total, currency), currency },
    financialStatus: mapFinancialStatus(raw.payment_status),
    fulfillmentStatus: mapFulfillmentStatus(raw.shipping_status),
    lineItems: orderLines.map((l) => mapLineItem(l, currency)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    note: statusIdentifier,
    createdAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
