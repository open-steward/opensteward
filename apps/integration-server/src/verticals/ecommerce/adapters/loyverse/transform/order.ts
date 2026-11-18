/**
 * Loyverse Receipt → canonical Order.
 *
 * In Loyverse, "receipts" are what other platforms call orders. Each receipt
 * has:
 *  - `receipt_number` (string, the primary identifier)
 *  - `receipt_type`: "SALE" | "REFUND"
 *  - `customer_id`: linked customer
 *  - `line_items[]`: sold items, each with variant_id, item_id, quantity,
 *    price (major units), gross_total_money, total_money
 *  - `payments[]`: one or more payment entries
 *  - `total_money`, `total_tax`, `total_discount`: amounts in major units
 *  - `store_id`: which Loyverse store
 *  - `created_at`, `updated_at`, `cancelled_at`
 *
 * Because receipts are immutable historical records in Loyverse (you cannot
 * update a receipt after the fact), we map `receipt_type` to financialStatus
 * and fulfillmentStatus as best we can.
 */

import type { Order, LineItem, OrderFinancialStatus } from '../../../schema/order'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Loyverse shapes ───────────────────────────────────────────────────────

export interface RawLoyverseLineItem {
  id?: string
  item_id?: string | null
  variant_id?: string | null
  item_name?: string
  variant_name?: string | null
  sku?: string | null
  quantity?: number
  /** Unit price in major units. */
  price?: number
  /** Total money for this line (after discounts) in major units. */
  total_money?: number
  gross_total_money?: number
  total_discount?: number
  line_note?: string | null
  [key: string]: unknown
}

export interface RawLoyversePayment {
  payment_type_id?: string
  name?: string
  money_amount?: number
  [key: string]: unknown
}

export interface RawLoyverseTaxLine {
  name?: string
  rate?: number
  money_amount?: number
}

export interface RawLoyverseDiscount {
  name?: string
  type?: string
  value?: number
  money_amount?: number
}

export interface RawLoyverseReceipt {
  receipt_number: string
  note?: string | null
  receipt_type?: string
  /** For refund receipts, the original sale receipt number. */
  refund_for?: string | null
  order?: string | null
  created_at?: string
  receipt_date?: string
  updated_at?: string
  cancelled_at?: string | null
  source?: string | null
  /** Total charged in major units. */
  total_money?: number
  total_tax?: number
  total_discount?: number
  tip?: number
  surcharge?: number
  customer_id?: string | null
  employee_id?: string | null
  store_id?: string
  pos_device_id?: string | null
  dining_option?: string | null
  total_discounts?: RawLoyverseDiscount[]
  total_taxes?: RawLoyverseTaxLine[]
  line_items?: RawLoyverseLineItem[]
  payments?: RawLoyversePayment[]
  points_earned?: number
  points_deducted?: number
  points_balance?: number
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMinor(v: number | null | undefined, currency: string): number {
  if (v == null) return 0
  return majorToMinor(v, currency)
}

function mapFinancialStatus(
  receiptType: string | undefined,
  cancelledAt: string | null | undefined,
): OrderFinancialStatus | undefined {
  if (cancelledAt) return 'VOIDED'
  if (!receiptType) return undefined
  const upper = receiptType.toUpperCase()
  if (upper === 'REFUND') return 'REFUNDED'
  if (upper === 'SALE') return 'PAID'
  return undefined
}

function mapLineItem(raw: RawLoyverseLineItem, currency: string): LineItem {
  return {
    id: raw.id ?? `${raw.variant_id ?? raw.item_id ?? 'unknown'}`,
    productId: raw.item_id ?? undefined,
    variantId: raw.variant_id ?? undefined,
    title: raw.item_name ?? raw.variant_name ?? 'Unknown',
    quantity: raw.quantity ?? 0,
    price: { amount: toMinor(raw.price, currency), currency },
    totalDiscount:
      raw.total_discount != null
        ? { amount: toMinor(raw.total_discount, currency), currency }
        : undefined,
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawLoyverseReceipt, currency: string = 'USD'): Order {
  const money = (v: number | null | undefined) => ({
    amount: toMinor(v, currency),
    currency,
  })

  const lineItems = (raw.line_items ?? []).map((li) => mapLineItem(li, currency))

  return {
    id: raw.receipt_number,
    orderNumber: raw.receipt_number,
    name: raw.order ?? raw.receipt_number,
    customerId: raw.customer_id ?? undefined,
    currency,
    totalTax: raw.total_tax != null ? money(raw.total_tax) : undefined,
    totalDiscounts: raw.total_discount != null ? money(raw.total_discount) : undefined,
    totalPrice: raw.total_money != null ? money(raw.total_money) : undefined,
    financialStatus: mapFinancialStatus(raw.receipt_type, raw.cancelled_at),
    // Loyverse receipts are POS sales — completed at the point of sale
    fulfillmentStatus: 'FULFILLED',
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    note: raw.note ?? undefined,
    createdAt: raw.created_at ?? raw.receipt_date,
    updatedAt: raw.updated_at,
    cancelledAt: raw.cancelled_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Loyverse receipt body (for create). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    customer_id: order.customerId,
    note: order.note,
    receipt_type: 'SALE',
    line_items: order.lineItems?.map((li) => ({
      item_id: li.productId,
      variant_id: li.variantId,
      item_name: li.title,
      quantity: li.quantity,
      price: li.price?.amount != null ? li.price.amount / 100 : undefined,
    })),
  }
}
