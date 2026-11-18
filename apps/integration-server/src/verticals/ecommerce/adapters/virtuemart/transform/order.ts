/**
 * VirtueMart Order → canonical Order.
 *
 * VirtueMart uses single-character status codes:
 *
 *   C  Confirmed   → financialStatus: PAID,    fulfillmentStatus: UNFULFILLED
 *   P  Pending     → financialStatus: PENDING, fulfillmentStatus: UNFULFILLED
 *   S  Shipped     → financialStatus: PAID,    fulfillmentStatus: FULFILLED
 *   X  Cancelled   → financialStatus: VOIDED,  fulfillmentStatus: UNFULFILLED
 *   R  Refunded    → financialStatus: REFUNDED, fulfillmentStatus: UNFULFILLED
 *   U  Unconfirmed → financialStatus: PENDING, fulfillmentStatus: UNFULFILLED
 *
 * Line items live under `order_lines[]`.
 * Total arrives as a numeric string (e.g. `"59.98"`).
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import {
  VM_STATUS_CONFIRMED,
  VM_STATUS_SHIPPED,
  VM_STATUS_CANCELLED,
  VM_STATUS_REFUNDED,
  DEFAULT_CURRENCY,
} from '../constants'
import { majorToMinor } from '../../../schema/shared'

// ── Raw VirtueMart shapes ────────────────────────────────────────────────────

export interface VirtueMartOrderLine {
  virtuemart_product_id?: number | string | null
  product_name?: string | null
  product_quantity?: number | null
  product_final_price?: string | number | null
  product_sku?: string | null
  [key: string]: unknown
}

export interface VirtueMartOrder {
  virtuemart_order_id: number | string
  order_number?: string | null
  order_status?: string | null
  order_total?: string | number | null
  order_currency?: string | null
  virtuemart_user_id?: number | string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  order_lines?: VirtueMartOrderLine[]
  created_on?: string | null
  modified_on?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseAmount(raw: string | number | null | undefined, currency?: string): number {
  if (raw == null) return 0
  const n = typeof raw === 'number' ? raw : parseFloat(raw)
  return isNaN(n) ? 0 : majorToMinor(n, currency)
}

function mapFinancialStatus(
  status: string | null | undefined,
): OrderFinancialStatus | undefined {
  if (!status) return undefined
  switch (status) {
    case VM_STATUS_CONFIRMED:
    case VM_STATUS_SHIPPED:
      return 'PAID'
    case VM_STATUS_REFUNDED:
      return 'REFUNDED'
    case VM_STATUS_CANCELLED:
      return 'VOIDED'
    default:
      // P (Pending), U (Unconfirmed), unknown
      return 'PENDING'
  }
}

function mapFulfillmentStatus(
  status: string | null | undefined,
): OrderFulfillmentStatus | undefined {
  if (!status) return undefined
  switch (status) {
    case VM_STATUS_SHIPPED:
      return 'FULFILLED'
    default:
      return 'UNFULFILLED'
  }
}

function mapLineItem(raw: VirtueMartOrderLine, currency: string, idx: number): LineItem {
  const productId =
    raw.virtuemart_product_id != null ? String(raw.virtuemart_product_id) : undefined

  return {
    id: productId ?? String(idx),
    productId,
    title: raw.product_name ?? 'Unknown product',
    quantity: raw.product_quantity ?? 1,
    price: { amount: parseAmount(raw.product_final_price, currency), currency },
    sku: raw.product_sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: VirtueMartOrder): Order {
  const currency = raw.order_currency ?? DEFAULT_CURRENCY
  const orderNumber = raw.order_number ?? undefined

  const lineItems = (raw.order_lines ?? []).map((line, i) =>
    mapLineItem(line, currency, i),
  )

  // VirtueMart stores timestamps as MySQL datetime strings
  // e.g. "2024-01-15 10:30:00" — convert to ISO 8601
  const toISO = (raw: string | null | undefined): string | undefined => {
    if (!raw) return undefined
    const d = new Date(raw)
    return isNaN(d.getTime()) ? undefined : d.toISOString()
  }

  return {
    id: String(raw.virtuemart_order_id),
    orderNumber,
    name: orderNumber ? `#${orderNumber}` : `#${raw.virtuemart_order_id}`,
    customerId:
      raw.virtuemart_user_id != null ? String(raw.virtuemart_user_id) : undefined,
    email: raw.email ?? undefined,
    currency,
    totalPrice: { amount: parseAmount(raw.order_total, currency), currency },
    financialStatus: mapFinancialStatus(raw.order_status),
    fulfillmentStatus: mapFulfillmentStatus(raw.order_status),
    lineItems,
    createdAt: toISO(raw.created_on),
    updatedAt: toISO(raw.modified_on),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
