/**
 * Clover Order → canonical Order.
 *
 * Clover orders contain line items and payments (tenders).
 * Money values are in integer cents.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { cloverCentsToMinor } from './product'

// ── Raw shapes ──────────────────────────────────────────────────────────────

export interface RawCloverLineItem {
  id: string
  item?: { id?: string }
  name?: string
  price?: number // integer cents
  unitQty?: number
  [key: string]: unknown
}

export interface RawCloverPayment {
  id?: string
  amount?: number
  [key: string]: unknown
}

export interface RawCloverRefundEntry {
  id?: string
  [key: string]: unknown
}

export interface RawCloverOrder {
  id: string
  title?: string
  note?: string
  state?: string // open, locked, paid
  total?: number // integer cents
  taxRemoved?: boolean
  lineItems?: { elements?: RawCloverLineItem[] }
  payments?: { elements?: RawCloverPayment[] }
  refunds?: { elements?: RawCloverRefundEntry[] }
  customers?: { elements?: Array<{ id?: string }> }
  currency?: string
  createdTime?: number
  modifiedTime?: number
  clientCreatedTime?: number
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapFinancialStatus(state: string | undefined): OrderFinancialStatus | undefined {
  switch (state) {
    case 'paid':
      return 'PAID'
    case 'open':
    case 'locked':
      return 'PENDING'
    default:
      return undefined
  }
}

function mapFulfillmentStatus(_raw: RawCloverOrder): OrderFulfillmentStatus {
  // Clover is POS — no fulfillment concept
  return 'UNFULFILLED'
}

function mapLineItem(raw: RawCloverLineItem, currency: string): LineItem {
  return {
    id: raw.id,
    productId: raw.item?.id ?? undefined,
    variantId: raw.item?.id ?? undefined,
    title: raw.name ?? '',
    quantity: raw.unitQty ?? 1,
    price: {
      amount: cloverCentsToMinor(raw.price),
      currency,
    },
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformOrder(raw: RawCloverOrder): Order {
  const currency = raw.currency ?? 'USD'
  const lineItems = (raw.lineItems?.elements ?? []).map((li) => mapLineItem(li, currency))
  const customerId = raw.customers?.elements?.[0]?.id ?? undefined
  const transactionIds = (raw.payments?.elements ?? [])
    .filter((p) => p.id)
    .map((p) => p.id!)
  const refundIds = (raw.refunds?.elements ?? [])
    .filter((r) => r.id)
    .map((r) => r.id!)

  return {
    id: raw.id,
    orderNumber: raw.title ?? undefined,
    name: raw.title ?? undefined,
    customerId,
    currency,
    totalPrice: raw.total != null
      ? { amount: cloverCentsToMinor(raw.total), currency }
      : undefined,
    financialStatus: mapFinancialStatus(raw.state),
    fulfillmentStatus: mapFulfillmentStatus(raw),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    transactionIds: transactionIds.length > 0 ? transactionIds : undefined,
    refundIds: refundIds.length > 0 ? refundIds : undefined,
    note: raw.note ?? undefined,
    createdAt: raw.createdTime ? new Date(raw.createdTime).toISOString() : undefined,
    updatedAt: raw.modifiedTime ? new Date(raw.modifiedTime).toISOString() : undefined,
    processedAt: raw.clientCreatedTime ? new Date(raw.clientCreatedTime).toISOString() : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Clover atomic order body for create. */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    orderCart: {
      lineItems: order.lineItems?.map((li) => ({
        item: li.variantId ? { id: li.variantId } : undefined,
        name: li.title,
        price: li.price ? Math.round(li.price.amount) : undefined,
        unitQty: li.quantity,
      })),
      note: order.note,
    },
  }
}
