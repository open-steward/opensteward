/**
 * Elastic Path Order → canonical Order.
 *
 * Elastic Path orders are at `/v2/orders`. Money fields use integer cents
 * (`{amount: 1299, currency: 'USD', includes_tax: true}`), which already
 * matches the canonical integer-minor-units contract — pass through unchanged.
 *
 * Status mapping:
 *   - incomplete → PENDING / UNFULFILLED
 *   - complete   → PAID / UNFULFILLED
 *   - processing → PAID / UNFULFILLED
 *   - cancelled  → VOIDED / UNFULFILLED
 *
 * Shipping status:
 *   - unfulfilled → UNFULFILLED
 *   - fulfilled   → FULFILLED
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'

// ── Raw Elastic Path shapes ──────────────────────────────────────────────────

export interface RawEpMoney {
  amount?: number
  currency?: string
  includes_tax?: boolean
}

export interface RawEpAddress {
  first_name?: string
  last_name?: string
  company_name?: string
  line_1?: string
  line_2?: string
  city?: string
  county?: string
  region?: string
  postcode?: string
  country?: string
  phone_number?: string
  [key: string]: unknown
}

export interface RawEpLineItem {
  id: string
  type: string
  product_id?: string
  name?: string
  description?: string
  sku?: string
  slug?: string
  quantity?: number
  unit_price?: RawEpMoney
  value?: RawEpMoney
  discounts?: Array<{ amount?: RawEpMoney; [key: string]: unknown }>
  [key: string]: unknown
}

export interface RawEpOrder {
  id: string
  type: string // order
  status?: string // incomplete | complete | processing | cancelled
  payment?: string // unpaid | authorized | paid | refunded
  shipping?: string // unfulfilled | fulfilled
  customer?: { name?: string; email?: string; id?: string }
  billing_address?: RawEpAddress
  shipping_address?: RawEpAddress
  relationships?: {
    items?: { data?: Array<{ type: string; id: string }> }
    [key: string]: unknown
  }
  meta?: {
    display_price?: {
      with_tax?: RawEpMoney
      without_tax?: RawEpMoney
      tax?: RawEpMoney
      discount?: RawEpMoney
      shipping?: RawEpMoney
      [key: string]: unknown
    }
    timestamps?: {
      created_at?: string
      updated_at?: string
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Elastic Path money is already in integer minor units (cents), matching the
// canonical Money.amount contract — pass it through unchanged.
function toMoney(money: RawEpMoney | undefined, fallbackCurrency: string) {
  if (!money) return undefined
  return {
    amount: Math.round(money.amount ?? 0),
    currency: money.currency ?? fallbackCurrency,
  }
}

// Elastic Path stores discounts as negative amounts (subtraction from total).
// The canonical schema models discount magnitudes as non-negative, so flip
// the sign before assigning.
function absMoney(money: { amount: number; currency: string } | undefined) {
  if (!money) return undefined
  return { amount: Math.abs(money.amount), currency: money.currency }
}

function mapAddress(raw: RawEpAddress | undefined | null): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.line_1
  const line2 = raw.line_2
  const city = raw.city
  const region = raw.county ?? raw.region
  const postalCode = raw.postcode
  const country = raw.country
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapFinancialStatus(
  status: string | undefined,
  payment: string | undefined,
): OrderFinancialStatus | undefined {
  if (status === 'cancelled') return 'VOIDED'
  switch (payment) {
    case 'paid':
      return 'PAID'
    case 'authorized':
      return 'AUTHORIZED'
    case 'refunded':
      return 'REFUNDED'
    case 'unpaid':
    default:
      return 'PENDING'
  }
}

function mapFulfillmentStatus(
  shipping: string | undefined,
): OrderFulfillmentStatus | undefined {
  switch (shipping) {
    case 'fulfilled':
      return 'FULFILLED'
    case 'unfulfilled':
    default:
      return 'UNFULFILLED'
  }
}

function mapLineItem(raw: RawEpLineItem, currency: string): LineItem {
  const unitPrice = toMoney(raw.unit_price, currency) ?? { amount: 0, currency }
  return {
    id: raw.id,
    productId: raw.product_id,
    title: raw.name ?? '',
    quantity: raw.quantity ?? 0,
    price: unitPrice,
    sku: raw.sku,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawEpOrder, lineItems?: RawEpLineItem[]): Order {
  const currency = raw.meta?.display_price?.with_tax?.currency ?? 'USD'
  const dp = raw.meta?.display_price

  return {
    id: raw.id,
    customerId: raw.customer?.id,
    email: raw.customer?.email,
    currency,
    subtotalPrice: toMoney(dp?.without_tax, currency),
    totalTax: toMoney(dp?.tax, currency),
    totalDiscounts: absMoney(toMoney(dp?.discount, currency)),
    totalShipping: toMoney(dp?.shipping, currency),
    totalPrice: toMoney(dp?.with_tax, currency),
    financialStatus: mapFinancialStatus(raw.status, raw.payment),
    fulfillmentStatus: mapFulfillmentStatus(raw.shipping),
    lineItems: lineItems?.map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    createdAt: toIsoDatetime(raw.meta?.timestamps?.created_at),
    updatedAt: toIsoDatetime(raw.meta?.timestamps?.updated_at),
    cancelledAt: raw.status === 'cancelled' ? raw.meta?.timestamps?.updated_at : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(
  order: Partial<Order>,
): Record<string, unknown> {
  return {
    data: {
      type: 'order',
      shipping: order.fulfillmentStatus === 'FULFILLED' ? 'fulfilled' : undefined,
    },
  }
}
