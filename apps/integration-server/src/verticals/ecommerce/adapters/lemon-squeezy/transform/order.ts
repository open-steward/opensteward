/**
 * Lemon Squeezy Order → canonical Order.
 *
 * LS order amounts are already in integer minor units (cents) — no conversion
 * needed. A single `first_order_item` is embedded on the order; use the
 * order-items endpoint for the full list.
 *
 * Financial status mapping:
 *   "pending"  → PENDING
 *   "paid"     → PAID
 *   "refunded" → REFUNDED
 *
 * Docs: https://docs.lemonsqueezy.com/api/orders/the-order-object
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
} from '../../../schema/order'
import type { LsResource } from '../client'

// ── Raw Lemon Squeezy attribute shape ─────────────────────────────────────────

export interface RawLsFirstOrderItem {
  id: number
  order_id: number
  product_id: number
  variant_id: number
  product_name: string
  variant_name: string
  price: number              // cents
  created_at: string
  updated_at: string
  test_mode?: boolean
}

export interface RawLsOrderAttributes {
  store_id: number
  customer_id: number
  identifier: string         // UUID e.g. "104e18a2-d755-..."
  order_number: number
  user_name: string
  user_email: string
  currency: string           // ISO 4217
  currency_rate: string
  subtotal: number           // cents
  discount_total: number     // cents
  tax: number                // cents
  total: number              // cents
  subtotal_usd?: number
  discount_total_usd?: number
  tax_usd?: number
  total_usd?: number
  tax_name?: string
  tax_rate?: number | string
  status: string             // "pending" | "paid" | "refunded"
  status_formatted?: string
  refunded: boolean
  refunded_at?: string | null
  subtotal_formatted?: string
  discount_total_formatted?: string
  tax_formatted?: string
  total_formatted?: string
  first_order_item: RawLsFirstOrderItem
  urls?: { receipt?: string }
  created_at: string
  updated_at: string
  test_mode?: boolean
  [key: string]: unknown
}

export type RawLsOrder = LsResource<RawLsOrderAttributes>

// ── Helpers ──────────────────────────────────────────────────────────────────

const FIN_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  pending: 'PENDING',
  paid: 'PAID',
  refunded: 'REFUNDED',
}

function buildLineItem(item: RawLsFirstOrderItem, currency: string): LineItem {
  return {
    id: String(item.id),
    productId: String(item.product_id),
    variantId: String(item.variant_id),
    title: item.product_name ?? item.variant_name ?? '',
    quantity: 1,
    price: { amount: item.price, currency },
    metadata: item as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawLsOrder): Order {
  const attrs = raw.attributes
  const currency = attrs.currency ?? 'USD'
  const money = (v: number) => ({ amount: v, currency })

  const lineItems: LineItem[] = []
  if (attrs.first_order_item) {
    lineItems.push(buildLineItem(attrs.first_order_item, currency))
  }

  return {
    id: raw.id,
    orderNumber: String(attrs.order_number),
    name: `#${attrs.order_number}`,
    customerId: String(attrs.customer_id),
    email: attrs.user_email || undefined,
    currency,
    subtotalPrice: money(attrs.subtotal),
    totalTax: money(attrs.tax),
    totalDiscounts: money(attrs.discount_total),
    totalPrice: money(attrs.total),
    financialStatus: FIN_STATUS_MAP[attrs.status] ?? undefined,
    lineItems,
    createdAt: attrs.created_at,
    updatedAt: attrs.updated_at,
    metadata: { id: raw.id, type: raw.type, ...attrs },
  }
}
