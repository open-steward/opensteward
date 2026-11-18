/**
 * Swell order → canonical Order.
 *
 * Fields read, from the order model
 * (https://developers.swell.is/backend-api/orders):
 *   id, number ("Unique incremental order number"), account_id, currency
 *   ("Three-letter ISO currency code in uppercase."), sub_total, tax_total,
 *   discount_total, shipment_total ("Total shipping price after discounts."),
 *   grand_total, coupon_code, notes, cancel_reason, date_canceled,
 *   date_created, date_updated, billing / shipping addresses, and
 *   items[] { id, product_id, variant_id, product_name, description, quantity
 *   ("Defaults to 1."), price ("Price of the item."), discount_total,
 *   quantity_deliverable, quantity_delivered }.
 *
 * Financial status comes from the documented booleans and totals:
 *   paid "Indicates the order was paid in full.", refunded "Indicates the
 *   order was fully refunded.", payment_total "Sum of payments applied to the
 *   order, not including refunds.", refund_total "Sum of refunds on payments
 *   applied to the order."
 * Fulfillment status from delivered "Indicates the order was completely
 * fulfilled." and item_quantity_delivered "Total quantity of line items that
 * have been fulfilled."
 *
 * Not mapped: email and phone (not order fields in the model), and the
 * shipment/refund/payment id lists (each is an "Expandable list", capped at
 * 5 records when expanded, so a list would be silently truncated).
 *
 * Money: decimals in major units, in the order's `currency`. With no
 * currency, order-level money is omitted and line items (whose price is
 * required) are refused.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Money } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { mapSwellAddress, type RawSwellAddress } from './customer'

// ── Raw Swell shapes ──────────────────────────────────────────────────────

export type RawSwellOrderAddress = RawSwellAddress

export interface RawSwellLineItem {
  id: string
  product_id?: string | null
  variant_id?: string | null
  product_name?: string | null
  description?: string | null
  quantity?: number | null
  price?: number | null
  discount_total?: number | null
  quantity_deliverable?: number | null
  quantity_delivered?: number | null
  [key: string]: unknown
}

export interface RawSwellOrder {
  id: string
  number?: string | number | null
  status?: string | null
  account_id?: string | null
  currency?: string | null
  sub_total?: number | null
  tax_total?: number | null
  discount_total?: number | null
  shipment_total?: number | null
  grand_total?: number | null
  payment_total?: number | null
  refund_total?: number | null
  paid?: boolean | null
  refunded?: boolean | null
  delivered?: boolean | null
  item_quantity_delivered?: number | null
  items?: RawSwellLineItem[] | null
  billing?: RawSwellOrderAddress | null
  shipping?: RawSwellOrderAddress | null
  coupon_code?: string | null
  notes?: string | null
  date_created?: string | null
  date_updated?: string | null
  date_canceled?: string | null
  cancel_reason?: string | null
  [key: string]: unknown
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mapFinancialStatus(raw: RawSwellOrder): OrderFinancialStatus | undefined {
  if (raw.refunded === true) return 'REFUNDED'
  if (raw.paid === true) {
    return raw.refund_total != null && raw.refund_total > 0 ? 'PARTIALLY_REFUNDED' : 'PAID'
  }
  if (raw.paid === false) {
    return raw.payment_total != null && raw.payment_total > 0 ? 'PARTIALLY_PAID' : 'PENDING'
  }
  return undefined
}

function mapFulfillmentStatus(raw: RawSwellOrder): OrderFulfillmentStatus | undefined {
  if (raw.delivered === true) return 'FULFILLED'
  if (raw.delivered === false) {
    return raw.item_quantity_delivered != null && raw.item_quantity_delivered > 0
      ? 'PARTIAL'
      : 'UNFULFILLED'
  }
  return undefined
}

function mapLineItem(
  raw: RawSwellLineItem,
  orderId: string,
  currency: string | undefined,
): LineItem {
  // A custom line item has no product; the model gives it a `description`
  // ("Description used for custom line items, when product is not defined.").
  const title = raw.product_name ?? raw.description
  if (raw.price == null || !currency || !title) {
    throw new Error(
      `Swell order ${orderId} item ${raw.id} lacks a price, a title or the order currency ` +
        `(price=${String(raw.price)}, currency=${String(currency)})`,
    )
  }
  const deliverable = raw.quantity_deliverable ?? undefined
  return {
    id: raw.id,
    productId: raw.product_id ?? undefined,
    variantId: raw.variant_id ?? undefined,
    title,
    // "Quantity of the item being ordered. Defaults to 1."
    quantity: raw.quantity ?? 1,
    price: { amount: majorToMinor(raw.price, currency), currency },
    totalDiscount:
      raw.discount_total != null
        ? { amount: majorToMinor(raw.discount_total, currency), currency }
        : undefined,
    fulfillableQuantity: deliverable != null && deliverable >= 0 ? deliverable : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawSwellOrder): Order {
  const currency = raw.currency ?? undefined
  const money = (v: number | null | undefined): Money | undefined =>
    v != null && currency ? { amount: majorToMinor(v, currency), currency } : undefined

  return {
    id: raw.id,
    orderNumber: raw.number != null ? String(raw.number) : undefined,
    customerId: raw.account_id ?? undefined,
    currency,
    subtotalPrice: money(raw.sub_total),
    totalTax: money(raw.tax_total),
    totalDiscounts: money(raw.discount_total),
    totalShipping: money(raw.shipment_total),
    totalPrice: money(raw.grand_total),
    financialStatus: mapFinancialStatus(raw),
    fulfillmentStatus: mapFulfillmentStatus(raw),
    lineItems: raw.items ? raw.items.map((li) => mapLineItem(li, raw.id, currency)) : undefined,
    billingAddress: mapSwellAddress(raw.billing),
    shippingAddress: mapSwellAddress(raw.shipping),
    discountCodes: raw.coupon_code ? [raw.coupon_code] : undefined,
    note: raw.notes ?? undefined,
    createdAt: raw.date_created ?? undefined,
    updatedAt: raw.date_updated ?? undefined,
    cancelledAt: raw.date_canceled ?? undefined,
    cancelReason: raw.cancel_reason ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Swell order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  function buildAddress(a: Order['billingAddress']): Record<string, unknown> | undefined {
    if (!a) return undefined
    return {
      address1: a.line1,
      address2: a.line2,
      city: a.city,
      state: a.region,
      zip: a.postalCode,
      country: a.country,
    }
  }

  const body: Record<string, unknown> = {}
  if (order.email !== undefined) body['email'] = order.email
  if (order.customerId !== undefined) body['account_id'] = order.customerId
  if (order.currency !== undefined) body['currency'] = order.currency
  if (order.billingAddress !== undefined) body['billing'] = buildAddress(order.billingAddress)
  if (order.shippingAddress !== undefined) body['shipping'] = buildAddress(order.shippingAddress)
  if (order.note !== undefined) body['notes'] = order.note
  if (order.lineItems) {
    body['items'] = order.lineItems.map((li) => ({
      product_name: li.title,
      quantity: li.quantity,
      price: li.price?.amount,
      variant_id: li.variantId,
      product_id: li.productId,
    }))
  }
  return body
}
