/**
 * fabric Order (OMS) → canonical Order.
 *
 * fabric orders endpoint: `GET /v3/orders`.
 * Money values are decimal (not cents). Status fields:
 *   - financial_status: pending | authorized | partially_paid | paid | partially_refunded | refunded | voided
 *   - fulfillment_status: unfulfilled | partial | fulfilled | restocked
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw fabric shapes ────────────────────────────────────────────────────────

export interface RawFabricAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postal_code?: string
  country?: string
  [key: string]: unknown
}

export interface RawFabricLineItem {
  id: string
  product_id?: string
  variant_id?: string
  title?: string
  quantity?: number
  price?: number
  currency?: string
  total_discount?: number
  sku?: string
  fulfillable_quantity?: number
  fulfillment_status?: string
  [key: string]: unknown
}

export interface RawFabricOrder {
  id: string
  order_number?: string
  name?: string
  customer_id?: string
  email?: string
  phone?: string
  currency?: string
  subtotal_price?: number
  total_tax?: number
  total_discounts?: number
  total_shipping?: number
  total_price?: number
  financial_status?: string
  fulfillment_status?: string
  line_items?: RawFabricLineItem[]
  billing_address?: RawFabricAddress
  shipping_address?: RawFabricAddress
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapFinancialStatus(status: string | undefined): OrderFinancialStatus | undefined {
  switch (status) {
    case 'pending': return 'PENDING'
    case 'authorized': return 'AUTHORIZED'
    case 'partially_paid': return 'PARTIALLY_PAID'
    case 'paid': return 'PAID'
    case 'partially_refunded': return 'PARTIALLY_REFUNDED'
    case 'refunded': return 'REFUNDED'
    case 'voided': return 'VOIDED'
    default: return 'unknown'
  }
}

function mapFulfillmentStatus(status: string | undefined): OrderFulfillmentStatus | undefined {
  switch (status) {
    case 'unfulfilled': return 'UNFULFILLED'
    case 'partial': return 'PARTIAL'
    case 'fulfilled': return 'FULFILLED'
    case 'restocked': return 'RESTOCKED'
    default: return 'unknown'
  }
}

function mapAddress(raw: RawFabricAddress | undefined | null): Address | undefined {
  if (!raw) return undefined
  if (!raw.line1 && !raw.city && !raw.postal_code && !raw.country) return undefined
  return {
    line1: raw.line1,
    line2: raw.line2,
    city: raw.city,
    region: raw.state,
    postalCode: raw.postal_code,
    country: raw.country,
  }
}

function mapLineItem(raw: RawFabricLineItem, currency: string): LineItem {
  return {
    id: raw.id,
    productId: raw.product_id,
    variantId: raw.variant_id,
    title: raw.title ?? '',
    quantity: raw.quantity ?? 0,
    price: {
      amount: majorToMinor(raw.price ?? 0, raw.currency ?? currency),
      currency: raw.currency ?? currency,
    },
    totalDiscount:
      raw.total_discount != null
        ? {
            amount: majorToMinor(raw.total_discount, raw.currency ?? currency),
            currency: raw.currency ?? currency,
          }
        : undefined,
    sku: raw.sku,
    fulfillableQuantity: raw.fulfillable_quantity,
    fulfillmentStatus: mapFulfillmentStatus(raw.fulfillment_status),
    metadata: raw as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawFabricOrder): Order {
  const currency = raw.currency ?? 'USD'
  return {
    id: raw.id,
    orderNumber: raw.order_number,
    name: raw.name,
    customerId: raw.customer_id,
    email: raw.email,
    phone: raw.phone,
    currency,
    subtotalPrice: raw.subtotal_price != null ? { amount: majorToMinor(raw.subtotal_price, currency), currency } : undefined,
    totalTax: raw.total_tax != null ? { amount: majorToMinor(raw.total_tax, currency), currency } : undefined,
    totalDiscounts: raw.total_discounts != null ? { amount: majorToMinor(raw.total_discounts, currency), currency } : undefined,
    totalShipping: raw.total_shipping != null ? { amount: majorToMinor(raw.total_shipping, currency), currency } : undefined,
    totalPrice: raw.total_price != null ? { amount: majorToMinor(raw.total_price, currency), currency } : undefined,
    financialStatus: mapFinancialStatus(raw.financial_status),
    fulfillmentStatus: mapFulfillmentStatus(raw.fulfillment_status),
    lineItems: raw.line_items?.map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    fulfillmentIds: raw.fulfillment_ids,
    refundIds: raw.refund_ids,
    transactionIds: raw.transaction_ids,
    discountCodes: raw.discount_codes,
    tags: raw.tags,
    note: raw.note,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    processedAt: raw.processed_at,
    cancelledAt: raw.cancelled_at,
    cancelReason: raw.cancel_reason,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    customer_id: order.customerId,
    email: order.email,
    phone: order.phone,
    currency: order.currency,
    note: order.note,
    tags: order.tags,
    line_items: order.lineItems?.map((li) => ({
      product_id: li.productId,
      variant_id: li.variantId,
      title: li.title,
      quantity: li.quantity,
      price: li.price?.amount,
      sku: li.sku,
    })),
  }
}
