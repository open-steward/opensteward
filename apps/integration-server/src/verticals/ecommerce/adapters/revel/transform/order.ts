/**
 * Revel Order → canonical Order.
 *
 * Revel orders come from `/resources/Order/`. Line items are
 * nested as `orderitems`. Money values are decimal numbers.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { extractId } from './inventory'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ──────────────────────────────────────────────────────────────

export interface RawRevelOrderItem {
  id: number
  product?: string | number // resource URI or ID
  product_name_override?: string
  price?: number
  quantity?: number
  [key: string]: unknown
}

export interface RawRevelOrder {
  id: number
  order_number?: string
  customer?: string | number | null // resource URI or ID
  final_total?: number
  subtotal?: number
  tax?: number
  discount_total?: number
  dining_option?: number // 0=dine-in, 1=takeout, 2=delivery, etc.
  notes?: string
  closed?: boolean
  voided?: boolean
  orderitems?: RawRevelOrderItem[]
  created_date?: string
  updated_date?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapFinancialStatus(raw: RawRevelOrder): OrderFinancialStatus | undefined {
  if (raw.voided) return 'VOIDED'
  if (raw.closed) return 'PAID'
  return 'PENDING'
}

function mapFulfillmentStatus(raw: RawRevelOrder): OrderFulfillmentStatus {
  if (raw.closed) return 'FULFILLED'
  return 'UNFULFILLED'
}

function mapLineItem(raw: RawRevelOrderItem, currency: string): LineItem {
  const productId = extractId(raw.product)
  return {
    id: String(raw.id),
    productId: productId || undefined,
    variantId: productId || undefined,
    title: raw.product_name_override ?? '',
    quantity: raw.quantity ?? 1,
    price: {
      amount: majorToMinor(raw.price ?? 0, currency),
      currency,
    },
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformOrder(raw: RawRevelOrder): Order {
  const currency = 'USD'
  const lineItems = (raw.orderitems ?? []).map((li) => mapLineItem(li, currency))
  const customerId = raw.customer ? extractId(raw.customer as string | number) : undefined

  return {
    id: String(raw.id),
    orderNumber: raw.order_number ?? undefined,
    name: raw.order_number ? `#${raw.order_number}` : undefined,
    customerId: customerId || undefined,
    currency,
    subtotalPrice: raw.subtotal != null
      ? { amount: majorToMinor(raw.subtotal, currency), currency }
      : undefined,
    totalTax: raw.tax != null
      ? { amount: majorToMinor(raw.tax, currency), currency }
      : undefined,
    totalDiscounts: raw.discount_total != null
      ? { amount: majorToMinor(raw.discount_total, currency), currency }
      : undefined,
    totalPrice: raw.final_total != null
      ? { amount: majorToMinor(raw.final_total, currency), currency }
      : undefined,
    financialStatus: mapFinancialStatus(raw),
    fulfillmentStatus: mapFulfillmentStatus(raw),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    note: raw.notes ?? undefined,
    createdAt: raw.created_date ?? undefined,
    updatedAt: raw.updated_date ?? undefined,
    cancelledAt: raw.voided ? raw.updated_date : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Revel order body for create. */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (order.note != null) body['notes'] = order.note
  if (order.lineItems) {
    body['orderitems'] = order.lineItems.map((li) => ({
      product: li.variantId ? `/resources/Product/${li.variantId}/` : undefined,
      product_name_override: li.title,
      price: li.price?.amount != null ? li.price.amount / 100 : undefined,
      quantity: li.quantity,
    }))
  }
  return body
}
