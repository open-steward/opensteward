/**
 * Commerce Layer Order → canonical Order.
 *
 * Commerce Layer orders use a rich status model:
 *   - `status`: draft | pending | placed | approved | cancelled
 *   - `payment_status`: unpaid | authorized | partially_authorized | paid |
 *                        partially_paid | voided | partially_voided |
 *                        refunded | partially_refunded | free
 *   - `fulfillment_status`: unfulfilled | in_progress | fulfilled | not_required
 *
 * Money fields use `_cents` suffix (integer cents) and `_float` suffix (string).
 * Currency from the `currency_code` field.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Commerce Layer shapes ────────────────────────────────────────────────

export interface RawCLAddress {
  line_1?: string
  line_2?: string
  city?: string
  state_code?: string
  zip_code?: string
  country_code?: string
  phone?: string
  first_name?: string
  last_name?: string
  [key: string]: unknown
}

export interface RawCLLineItem {
  id: string
  sku_code?: string
  name?: string
  quantity?: number
  unit_amount_cents?: number
  unit_amount_float?: number
  total_amount_cents?: number
  total_amount_float?: number
  currency_code?: string
  image_url?: string
  _type?: string
  _relationships?: Record<string, { data?: { id: string } | null }> | undefined
  [key: string]: unknown
}

export interface RawCLOrder {
  id: string
  number?: number | string
  status?: string
  payment_status?: string
  fulfillment_status?: string
  currency_code?: string
  subtotal_amount_cents?: number
  subtotal_amount_float?: number
  total_tax_amount_cents?: number
  total_tax_amount_float?: number
  discount_amount_cents?: number
  discount_amount_float?: number
  shipping_amount_cents?: number
  shipping_amount_float?: number
  total_amount_cents?: number
  total_amount_float?: number
  customer_email?: string
  customer_phone?: string | null
  language_code?: string
  coupon_code?: string
  gift_card_code?: string
  created_at?: string
  updated_at?: string
  placed_at?: string
  cancelled_at?: string
  cancel_reason?: string | null
  // Embedded or included addresses
  billing_address?: RawCLAddress | null
  shipping_address?: RawCLAddress | null
  // Embedded line items (if included)
  line_items?: RawCLLineItem[]
  _type?: string
  _relationships?: Record<string, unknown>
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(raw: RawCLAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.line_1
  const line2 = raw.line_2
  const city = raw.city
  const region = raw.state_code
  const postalCode = raw.zip_code
  const country = raw.country_code
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapFinancialStatus(paymentStatus: string | undefined): OrderFinancialStatus | undefined {
  if (!paymentStatus) return undefined
  switch (paymentStatus) {
    case 'unpaid':
    case 'free':
      return 'PENDING'
    case 'authorized':
    case 'partially_authorized':
      return 'AUTHORIZED'
    case 'partially_paid':
      return 'PARTIALLY_PAID'
    case 'paid':
      return 'PAID'
    case 'partially_refunded':
      return 'PARTIALLY_REFUNDED'
    case 'refunded':
      return 'REFUNDED'
    case 'voided':
    case 'partially_voided':
      return 'VOIDED'
    default:
      return 'PENDING'
  }
}

function mapFulfillmentStatus(
  fulfillmentStatus: string | undefined,
): OrderFulfillmentStatus | undefined {
  if (!fulfillmentStatus) return undefined
  switch (fulfillmentStatus) {
    case 'unfulfilled':
    case 'not_required':
      return 'UNFULFILLED'
    case 'in_progress':
      return 'PARTIAL'
    case 'fulfilled':
      return 'FULFILLED'
    default:
      return 'UNFULFILLED'
  }
}

function centsToAmount(cents: number | undefined, currency: string): { amount: number; currency: string } | undefined {
  if (cents == null) return undefined
  return { amount: Math.round(cents), currency }
}

function mapLineItem(raw: RawCLLineItem, currency: string): LineItem {
  return {
    id: raw.id,
    variantId: raw._relationships?.['sku']?.data?.id,
    title: raw.name ?? '',
    quantity: raw.quantity ?? 0,
    price: {
      amount:
        raw.unit_amount_cents != null
          ? Math.round(raw.unit_amount_cents)
          : (majorToMinor(raw.unit_amount_float, raw.currency_code ?? currency) ?? 0),
      currency: raw.currency_code ?? currency,
    },
    sku: raw.sku_code,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawCLOrder): Order {
  const currency = raw.currency_code ?? 'USD'
  const rels = raw._relationships as Record<string, { data?: { id: string } | null }> | undefined

  return {
    id: raw.id,
    orderNumber: raw.number != null ? String(raw.number) : undefined,
    name: raw.number != null ? `#${raw.number}` : undefined,
    customerId: rels?.['customer']?.data?.id,
    email: raw.customer_email,
    phone: raw.customer_phone ?? undefined,
    currency,
    subtotalPrice: centsToAmount(raw.subtotal_amount_cents, currency),
    totalTax: centsToAmount(raw.total_tax_amount_cents, currency),
    totalDiscounts: centsToAmount(raw.discount_amount_cents, currency),
    totalShipping: centsToAmount(raw.shipping_amount_cents, currency),
    totalPrice: centsToAmount(raw.total_amount_cents, currency),
    financialStatus: mapFinancialStatus(raw.payment_status),
    fulfillmentStatus: mapFulfillmentStatus(raw.fulfillment_status),
    lineItems: raw.line_items?.map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    discountCodes: raw.coupon_code ? [raw.coupon_code] : undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    processedAt: toIsoDatetime(raw.placed_at),
    cancelledAt: toIsoDatetime(raw.cancelled_at),
    cancelReason: raw.cancel_reason ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(
  order: Partial<Order>,
): Record<string, unknown> {
  return {
    data: {
      type: 'orders',
      attributes: {
        customer_email: order.email,
        language_code: (order.metadata as Record<string, unknown> | undefined)?.['language_code'],
        coupon_code: order.discountCodes?.[0],
      },
    },
  }
}
