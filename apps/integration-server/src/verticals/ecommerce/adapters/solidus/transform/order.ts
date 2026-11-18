/**
 * Solidus Order -> canonical Order.
 *
 * Solidus orders share the same state machine as Spree:
 *   cart -> address -> delivery -> payment -> confirm -> complete -> canceled/returned
 *
 * Payment state: `balance_due`, `credit_owed`, `paid`, `failed`, `void`
 * Shipment state: `pending`, `ready`, `shipped`, `partial`, `canceled`
 *
 * Solidus-specific:
 *  - `canceler_id` field tracks who cancelled the order
 *  - `approver_id` field for order approval workflow
 *
 * Platform API: `/api/v2/platform/orders`
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

// -- Raw Solidus shapes -------------------------------------------------------

export interface RawSolidusOrderAddress {
  firstname?: string
  lastname?: string
  address1?: string
  address2?: string | null
  city?: string
  state_name?: string | null
  zipcode?: string
  country_iso?: string
  phone?: string | null
  [key: string]: unknown
}

export interface RawSolidusLineItem {
  id: number | string
  variant_id?: number | string
  product_id?: number | string
  name?: string
  quantity?: number
  price?: string | number
  total?: string | number
  adjustment_total?: string | number
  additional_tax_total?: string | number
  sku?: string | null
  [key: string]: unknown
}

export interface RawSolidusOrder {
  id: number | string
  number?: string
  state?: string
  payment_state?: string | null
  shipment_state?: string | null
  email?: string
  user_id?: number | string | null
  currency?: string
  item_total?: string | number
  total?: string | number
  ship_total?: string | number
  adjustment_total?: string | number
  additional_tax_total?: string | number
  included_tax_total?: string | number
  promo_total?: string | number
  item_count?: number
  special_instructions?: string | null
  completed_at?: string | null
  canceled_at?: string | null
  canceler_id?: number | string | null
  approver_id?: number | string | null
  approved_at?: string | null
  created_at?: string
  updated_at?: string
  bill_address?: RawSolidusOrderAddress | null
  ship_address?: RawSolidusOrderAddress | null
  line_items?: RawSolidusLineItem[]
  coupon_codes?: string[]
  shipment_ids?: Array<number | string>
  [key: string]: unknown
}

// -- Helpers ------------------------------------------------------------------

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

/** Parse a Spree/Solidus decimal-string major value to integer minor units. */
function toMinor(v: string | number | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

function mapAddress(raw: RawSolidusOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1
  const line2 = raw.address2 ?? undefined
  const city = raw.city
  const region = raw.state_name ?? undefined
  const postalCode = raw.zipcode
  const country = raw.country_iso
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapFinancialStatus(
  paymentState: string | null | undefined,
): OrderFinancialStatus | undefined {
  switch (paymentState) {
    case 'balance_due':
      return 'PENDING'
    case 'paid':
      return 'PAID'
    case 'credit_owed':
      return 'PARTIALLY_REFUNDED'
    case 'void':
      return 'VOIDED'
    case 'failed':
      return 'VOIDED'
    default:
      return undefined
  }
}

function mapFulfillmentStatus(
  shipmentState: string | null | undefined,
): OrderFulfillmentStatus | undefined {
  switch (shipmentState) {
    case 'pending':
    case 'ready':
      return 'UNFULFILLED'
    case 'partial':
      return 'PARTIAL'
    case 'shipped':
      return 'FULFILLED'
    case 'canceled':
      return 'RESTOCKED'
    default:
      return 'UNFULFILLED'
  }
}

function mapLineItem(raw: RawSolidusLineItem, currency: string): LineItem {
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId: raw.variant_id != null ? String(raw.variant_id) : undefined,
    title: raw.name ?? '',
    quantity: raw.quantity ?? 0,
    price: { amount: toMinor(raw.price, currency), currency },
    totalDiscount:
      raw.adjustment_total != null && toNum(raw.adjustment_total) < 0
        ? { amount: Math.abs(toMinor(raw.adjustment_total, currency)), currency }
        : undefined,
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawSolidusOrder): Order {
  const currency = raw.currency ?? 'USD'
  const money = (v: string | number | undefined | null) =>
    v != null ? { amount: toMinor(v, currency), currency } : undefined

  return {
    id: String(raw.id),
    orderNumber: raw.number,
    name: raw.number != null ? `#${raw.number}` : undefined,
    customerId: raw.user_id != null ? String(raw.user_id) : undefined,
    email: raw.email,
    currency,
    subtotalPrice: money(raw.item_total),
    totalTax: money(raw.additional_tax_total),
    totalDiscounts:
      raw.promo_total != null
        ? { amount: Math.abs(toMinor(raw.promo_total, currency)), currency }
        : undefined,
    totalShipping: money(raw.ship_total),
    totalPrice: money(raw.total),
    financialStatus: mapFinancialStatus(raw.payment_state),
    fulfillmentStatus: mapFulfillmentStatus(raw.shipment_state),
    lineItems: (raw.line_items ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.bill_address),
    shippingAddress: mapAddress(raw.ship_address),
    discountCodes: raw.coupon_codes,
    fulfillmentIds: raw.shipment_ids?.map(String),
    note: raw.special_instructions ?? undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    processedAt: toIsoDatetime(raw.completed_at),
    cancelledAt: toIsoDatetime(raw.canceled_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
