/**
 * Alibaba.com order → canonical Order.
 *
 * Two documented shapes (cid=8):
 *
 *   - a `value.order_list[]` row of "alibaba order list" (/alibaba/order/list):
 *     only trade_id, trade_status, create_date and modify_date;
 *   - `value` of "alibaba order get" (/alibaba/order/get): amounts as
 *     `{ amount, currency }`, order_products, shipping_address, buyer.
 *
 * `trade_status` values are those of docId=131 ("Order Status/Order API FAQ"),
 * which both APIs link to:
 *   to_be_audited: Waiting for audit · unpay: Waiting for advance payment ·
 *   paying: Buyer has paid but needs to verify · paid: Buyer payment success ·
 *   relating: In relation · captured: The payment is completed ·
 *   undeliver: Waiting for seller to ship · delivering: In delivery (Seller
 *   shipping) · wait_confirm_receipt: Waiting for the buyer to confirm the
 *   receipt · intention_processing · trade_close: Trading closed, canceled ·
 *   trade_success: Order completed · wait_confirm_modify ·
 *   trade_unavailable · charge_back · frozen.
 * A status the FAQ gives no payment or shipping meaning for maps to nothing.
 *
 * `create_date.timestamp` / `modify_date.timestamp` are epoch milliseconds in
 * the documented examples ("timestamp": "1754021376000" beside
 * "Jul. 31, 2025, 21:09:36 PDT.").
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import type { Money } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { isIso3166Alpha2, toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawAlibabaDate {
  format_date?: string
  timestamp?: number | string
}

/** /alibaba/order/list `value.order_list[]`. */
export interface RawAlibabaOrderSummary {
  /** "order id" */
  trade_id?: string
  trade_status?: string
  create_date?: RawAlibabaDate
  modify_date?: RawAlibabaDate
  [key: string]: unknown
}

export interface RawAlibabaAmount {
  amount?: string
  currency?: string
}

export interface RawAlibabaOrderProduct {
  /** "primary id" */
  id?: string
  product_id?: number | string
  sku_id?: string
  sku_code?: string
  name?: string
  quantity?: string
  unit_price?: RawAlibabaAmount
  [key: string]: unknown
}

export interface RawAlibabaShippingAddress {
  address?: string
  alternate_address?: string
  city?: string
  province?: string
  zip?: string
  country_code?: string
  [key: string]: unknown
}

/** /alibaba/order/get `value`. */
export interface RawAlibabaOrderDetail {
  trade_id?: string
  trade_status?: string
  create_date?: RawAlibabaDate
  buyer?: { immutable_eid?: string; full_name?: string }
  total_amount?: RawAlibabaAmount
  product_total_amount?: RawAlibabaAmount
  shipment_fee?: RawAlibabaAmount
  discount_amount?: RawAlibabaAmount
  vat_amount?: RawAlibabaAmount
  order_products?: RawAlibabaOrderProduct[]
  shipping_address?: RawAlibabaShippingAddress
  [key: string]: unknown
}

// ── Status ────────────────────────────────────────────────────────────────────

export function mapFinancialStatus(status: string | undefined): OrderFinancialStatus | undefined {
  switch (status) {
    case 'to_be_audited':
    case 'unpay':
    case 'paying':
    case 'relating':
    case 'intention_processing':
    case 'wait_confirm_modify':
      return 'PENDING'
    case 'paid':
    case 'captured':
    case 'undeliver': // docId=131: "Take undeliver , in this state, the order must have been paid successfully."
    case 'delivering':
    case 'wait_confirm_receipt':
    case 'trade_success':
      return 'PAID'
    default:
      return undefined
  }
}

export function mapFulfillmentStatus(
  status: string | undefined,
): OrderFulfillmentStatus | undefined {
  switch (status) {
    case 'to_be_audited':
    case 'unpay':
    case 'paying':
    case 'paid':
    case 'relating':
    case 'captured':
    case 'undeliver':
    case 'intention_processing':
    case 'wait_confirm_modify':
      return 'UNFULFILLED'
    case 'delivering':
    case 'wait_confirm_receipt':
    case 'trade_success':
      return 'FULFILLED'
    default:
      return undefined
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** `{ amount, currency }` → Money, or undefined when either half is missing. */
export function toMoney(raw: RawAlibabaAmount | undefined): Money | undefined {
  if (!raw || raw.amount == null || raw.amount === '' || !raw.currency) return undefined
  const amount = majorToMinor(Number(raw.amount), raw.currency)
  return amount === undefined ? undefined : { amount, currency: raw.currency }
}

function buildAddress(raw: RawAlibabaShippingAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const address: Address = {
    line1: raw.address || undefined,
    line2: raw.alternate_address || undefined,
    city: raw.city || undefined,
    region: raw.province || undefined,
    postalCode: raw.zip || undefined,
    country: raw.country_code && isIso3166Alpha2(raw.country_code) ? raw.country_code : undefined,
  }
  return Object.values(address).some((v) => v !== undefined) ? address : undefined
}

/** Canonical titles are required; an absent or empty source field is refused, not filled in. */
function requireTitle(value: string | undefined, what: string): string {
  if (!value) throw new Error(`Alibaba ${what}`)
  return value
}

function lineItem(p: RawAlibabaOrderProduct, tradeId: string): LineItem {
  const price = toMoney(p.unit_price)
  const quantity = Number(p.quantity)
  if (!p.id || !price || !Number.isInteger(quantity) || quantity < 0) {
    throw new Error(
      `Alibaba order ${tradeId}: order_products row ${p.id ?? '(no id)'} lacks a whole ` +
        `quantity or a unit_price with amount and currency (quantity ${String(p.quantity)})`,
    )
  }
  return {
    id: p.id,
    productId: p.product_id != null ? String(p.product_id) : undefined,
    variantId: p.sku_id || undefined,
    title: requireTitle(p.name, `order ${tradeId}: order_products row ${p.id} has no name`),
    quantity,
    price,
    sku: p.sku_code || undefined,
    metadata: p as Record<string, unknown>,
  }
}

function requireTradeId(raw: { trade_id?: string }, where: string): string {
  if (!raw.trade_id) throw new Error(`Alibaba ${where} has no trade_id`)
  return raw.trade_id
}

// ── Transforms ────────────────────────────────────────────────────────────────

/** An order.list row → Order (id, statuses and dates only). */
export function transformOrderSummary(raw: RawAlibabaOrderSummary): Order {
  const id = requireTradeId(raw, 'order.list row')
  return {
    id,
    orderNumber: id,
    financialStatus: mapFinancialStatus(raw.trade_status),
    fulfillmentStatus: mapFulfillmentStatus(raw.trade_status),
    createdAt: toIsoDatetime(raw.create_date?.timestamp),
    updatedAt: toIsoDatetime(raw.modify_date?.timestamp),
    metadata: raw as Record<string, unknown>,
  }
}

/** An order.get `value` → Order. */
export function transformOrderDetail(raw: RawAlibabaOrderDetail): Order {
  const id = requireTradeId(raw, 'order.get response')
  const total = toMoney(raw.total_amount)
  const lineItems = (raw.order_products ?? []).map((p) => lineItem(p, id))
  return {
    id,
    orderNumber: id,
    customerId: raw.buyer?.immutable_eid || undefined,
    currency: total?.currency,
    subtotalPrice: toMoney(raw.product_total_amount),
    totalTax: toMoney(raw.vat_amount),
    totalDiscounts: toMoney(raw.discount_amount),
    totalShipping: toMoney(raw.shipment_fee),
    totalPrice: total,
    financialStatus: mapFinancialStatus(raw.trade_status),
    fulfillmentStatus: mapFulfillmentStatus(raw.trade_status),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippingAddress: buildAddress(raw.shipping_address),
    createdAt: toIsoDatetime(raw.create_date?.timestamp),
    metadata: raw as Record<string, unknown>,
  }
}
