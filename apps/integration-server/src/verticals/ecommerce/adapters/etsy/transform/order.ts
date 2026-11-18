/**
 * Etsy Receipt → canonical Order.
 *
 * Etsy calls orders "receipts". A receipt has a `receipt_id`, contains
 * `transactions` (line items — confusingly named), and carries buyer
 * email, shipping address, payment status, etc.
 *
 * Key mapping:
 *  - `receipt_id` (stringified) → canonical `id`
 *  - `transactions[]` → canonical `lineItems[]`
 *  - `status` (paid/completed/open) → financial/fulfillment status
 *  - `buyer_email` → `email`
 *  - Money fields use Etsy's `{amount, divisor, currency_code}` format.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { RawEtsyMoney } from './product'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawEtsyTransaction {
  transaction_id: number
  listing_id?: number
  title?: string
  quantity?: number
  price?: RawEtsyMoney
  shipping_cost?: RawEtsyMoney
  sku?: string
  [key: string]: unknown
}

export interface RawEtsyReceipt {
  receipt_id: number
  buyer_email?: string
  buyer_user_id?: number
  name?: string
  status?: string
  payment_method?: string
  grandtotal?: RawEtsyMoney
  subtotal?: RawEtsyMoney
  total_tax_cost?: RawEtsyMoney
  total_shipping_cost?: RawEtsyMoney
  discount_amt?: RawEtsyMoney
  transactions?: RawEtsyTransaction[]
  shipments?: Array<Record<string, unknown>>
  is_paid?: boolean
  is_shipped?: boolean
  create_timestamp?: number
  created_timestamp?: number
  update_timestamp?: number
  updated_timestamp?: number
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function etsyMoneyToCanonical(
  money: RawEtsyMoney | undefined,
): { amount: number; currency: string } | undefined {
  if (!money || money.divisor === 0) return undefined
  return {
    // Etsy reports major units via amount/divisor; convert to canonical
    // integer minor units for the receipt's currency.
    amount: majorToMinor(money.amount / money.divisor, money.currency_code),
    currency: money.currency_code,
  }
}

/**
 * Map Etsy receipt status to canonical financial status.
 * Etsy uses `is_paid` boolean and `status` string.
 */
export function mapFinancialStatus(receipt: RawEtsyReceipt): OrderFinancialStatus | undefined {
  if (receipt.is_paid === true) return 'PAID'
  if (receipt.status === 'paid' || receipt.status === 'completed') return 'PAID'
  if (receipt.status === 'open') return 'PENDING'
  return undefined
}

/**
 * Map Etsy receipt to canonical fulfillment status.
 * Etsy uses `is_shipped` boolean.
 */
export function mapFulfillmentStatus(receipt: RawEtsyReceipt): OrderFulfillmentStatus | undefined {
  if (receipt.is_shipped === true) return 'FULFILLED'
  if (receipt.status === 'completed') return 'FULFILLED'
  return 'UNFULFILLED'
}

function mapLineItem(tx: RawEtsyTransaction): LineItem {
  const price = etsyMoneyToCanonical(tx.price) ?? { amount: 0, currency: 'USD' }
  return {
    id: String(tx.transaction_id),
    productId: tx.listing_id != null ? String(tx.listing_id) : undefined,
    title: tx.title ?? String(tx.transaction_id),
    quantity: tx.quantity ?? 1,
    price,
    sku: tx.sku ?? undefined,
    metadata: tx as unknown as Record<string, unknown>,
  }
}

function tsToIso(ts: number | undefined): string | undefined {
  if (ts == null) return undefined
  return new Date(ts * 1000).toISOString()
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawEtsyReceipt): Order {
  const totalPrice = etsyMoneyToCanonical(raw.grandtotal)
  const currency = raw.grandtotal?.currency_code ?? 'USD'
  const lineItems = (raw.transactions ?? []).map(mapLineItem)

  return {
    id: String(raw.receipt_id),
    orderNumber: String(raw.receipt_id),
    name: raw.name ?? String(raw.receipt_id),
    email: raw.buyer_email ?? undefined,
    customerId: raw.buyer_user_id != null ? String(raw.buyer_user_id) : undefined,
    currency,
    totalPrice,
    subtotalPrice: etsyMoneyToCanonical(raw.subtotal),
    totalTax: etsyMoneyToCanonical(raw.total_tax_cost),
    totalShipping: etsyMoneyToCanonical(raw.total_shipping_cost),
    totalDiscounts: etsyMoneyToCanonical(raw.discount_amt),
    financialStatus: mapFinancialStatus(raw),
    fulfillmentStatus: mapFulfillmentStatus(raw),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    createdAt: tsToIso(raw.created_timestamp ?? raw.create_timestamp),
    updatedAt: tsToIso(raw.updated_timestamp ?? raw.update_timestamp),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
