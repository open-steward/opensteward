/**
 * Square Order → canonical Order.
 *
 * Square orders require a `location_id` and contain nested line items,
 * fulfillments (as an array), and tenders (payment references).
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { squareMoneyToDecimal } from './product'

// ── Raw shapes ──────────────────────────────────────────────────────────────

export interface RawSquareMoney {
  amount?: number
  currency?: string
}

export interface RawSquareTax {
  name?: string
  percentage?: string
  applied_money?: RawSquareMoney
  uid?: string
}

export interface RawSquareLineItem {
  uid: string
  catalog_object_id?: string
  catalog_version?: number
  name?: string
  quantity: string
  base_price_money?: RawSquareMoney
  total_discount_money?: RawSquareMoney
  total_tax_money?: RawSquareMoney
  variation_name?: string
  applied_taxes?: Array<{ tax_uid?: string }>
  [key: string]: unknown
}

export interface RawSquareFulfillment {
  uid?: string
  type?: string
  state?: string
  [key: string]: unknown
}

export interface RawSquareTender {
  id?: string
  type?: string
  amount_money?: RawSquareMoney
  payment_id?: string
  [key: string]: unknown
}

export interface RawSquareOrderDiscount {
  uid?: string
  catalog_object_id?: string
  name?: string
  amount_money?: RawSquareMoney
  applied_money?: RawSquareMoney
}

export interface RawSquareRefundEntry {
  id?: string
}

export interface RawSquareOrder {
  id: string
  location_id: string
  reference_id?: string
  customer_id?: string
  state?: string // OPEN, COMPLETED, CANCELED
  total_money?: RawSquareMoney
  total_tax_money?: RawSquareMoney
  total_discount_money?: RawSquareMoney
  total_service_charge_money?: RawSquareMoney
  net_amounts?: {
    total_money?: RawSquareMoney
    tax_money?: RawSquareMoney
    discount_money?: RawSquareMoney
    service_charge_money?: RawSquareMoney
  }
  line_items?: RawSquareLineItem[]
  taxes?: RawSquareTax[]
  fulfillments?: RawSquareFulfillment[]
  tenders?: RawSquareTender[]
  refunds?: RawSquareRefundEntry[]
  discounts?: RawSquareOrderDiscount[]
  created_at?: string
  updated_at?: string
  closed_at?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapFinancialStatus(state: string | undefined, tenders: RawSquareTender[] | undefined): OrderFinancialStatus | undefined {
  if (state === 'CANCELED') return 'VOIDED'
  if (!tenders || tenders.length === 0) return 'PENDING'
  return 'PAID'
}

function mapFulfillmentStatus(fulfillments: RawSquareFulfillment[] | undefined): OrderFulfillmentStatus | undefined {
  if (!fulfillments || fulfillments.length === 0) return 'UNFULFILLED'
  const states = fulfillments.map((f) => f.state?.toUpperCase())
  if (states.every((s) => s === 'COMPLETED')) return 'FULFILLED'
  if (states.some((s) => s === 'COMPLETED')) return 'PARTIAL'
  return 'UNFULFILLED'
}

function squareMoney(m: RawSquareMoney | undefined): { amount: number; currency: string } | undefined {
  if (!m || m.amount == null) return undefined
  const currency = m.currency ?? 'USD'
  return { amount: squareMoneyToDecimal(m.amount, currency), currency }
}

function mapLineItem(raw: RawSquareLineItem, currency: string): LineItem {
  const qty = parseInt(raw.quantity, 10) || 0
  return {
    id: raw.uid,
    variantId: raw.catalog_object_id ?? undefined,
    title: raw.name ?? raw.variation_name ?? '',
    quantity: qty,
    price: {
      amount: squareMoneyToDecimal(raw.base_price_money?.amount, currency),
      currency,
    },
    totalDiscount: squareMoney(raw.total_discount_money),
    sku: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformOrder(raw: RawSquareOrder): Order {
  const currency = raw.total_money?.currency ?? 'USD'
  const lineItems = (raw.line_items ?? []).map((li) => mapLineItem(li, currency))
  const fulfillmentIds = (raw.fulfillments ?? [])
    .filter((f) => f.uid)
    .map((f) => f.uid!)
  const tenderPaymentIds = (raw.tenders ?? [])
    .filter((t) => t.payment_id)
    .map((t) => t.payment_id!)
  const refundIds = (raw.refunds ?? [])
    .filter((r) => r.id)
    .map((r) => r.id!)

  return {
    id: raw.id,
    orderNumber: raw.reference_id ?? undefined,
    customerId: raw.customer_id ?? undefined,
    currency,
    totalPrice: squareMoney(raw.total_money),
    totalTax: squareMoney(raw.total_tax_money),
    totalDiscounts: squareMoney(raw.total_discount_money),
    financialStatus: mapFinancialStatus(raw.state, raw.tenders),
    fulfillmentStatus: mapFulfillmentStatus(raw.fulfillments),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    fulfillmentIds: fulfillmentIds.length > 0 ? fulfillmentIds : undefined,
    transactionIds: tenderPaymentIds.length > 0 ? tenderPaymentIds : undefined,
    refundIds: refundIds.length > 0 ? refundIds : undefined,
    cancelledAt: raw.state === 'CANCELED' ? raw.updated_at : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Square order body for create. */
export function untransformOrder(order: Partial<Order>, locationId?: string): Record<string, unknown> {
  return {
    location_id: locationId,
    reference_id: order.orderNumber,
    customer_id: order.customerId,
    line_items: order.lineItems?.map((li) => ({
      catalog_object_id: li.variantId,
      name: li.title,
      quantity: String(li.quantity),
      base_price_money: li.price
        ? { amount: Math.round(li.price.amount * 100), currency: li.price.currency }
        : undefined,
    })),
  }
}
