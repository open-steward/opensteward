/**
 * GoDaddy order-subgraph Order → canonical Order.
 *
 * Fields are the ones the `orderById` / `orders` reference documents on
 * `Order` and `LineItem`
 * (https://developer.godaddy.com/docs/references/rest/orders/order/queries/orderById).
 * Money: "`Money` fields need `{ value currencyCode }`"
 * (https://developer.godaddy.com/docs/api-users/commerce/manage-orders-and-customers),
 * and `unitAmount` is "Stored as an integer in the currency's lowest
 * denomination (e.g. cents for USD)" — the canonical `Money.amount` unit.
 *
 * Only `totals.total` is mapped from `OrderTotals`: the guide's example
 * selects `totals { total { value currencyCode } }`, and no output field of
 * `OrderTotals` beyond it is documented. `statuses { status }` is an order
 * lifecycle status (OPEN / COMPLETED / CANCELED / DRAFT per the guide), not a
 * payment or fulfillment status, so it stays in metadata.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { LineItem, Order } from '../../../schema/order'
import type { Money } from '../../../schema/shared'

export interface RawGoDaddyMoney {
  value: number
  currencyCode: string
}

/** The `LineItem` fields `ORDER_FIELDS` selects. */
export interface RawGoDaddyLineItem {
  /** "Unique identifier for the line item" */
  id: string
  /** "Name of the line item used for display purposes to the merchant and customer" */
  name?: string | null
  /** "Quantity purchased by the customer. Note this could be a float value (e.g. 2.3 Kgs)" */
  quantity?: number | null
  /** "Reference to a SKU as defined by the Catalog (v2 or later) service." */
  skuId?: string | null
  /** "Price for each unit." */
  unitAmount?: RawGoDaddyMoney | null
}

/** The `Order` fields `ORDER_FIELDS` selects. */
export interface RawGoDaddyOrder {
  id: string
  number?: string | null
  numberDisplay?: string | null
  customerId?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  processedAt?: string | null
  canceledAt?: string | null
  tags?: string[] | null
  transactionIds?: string[] | null
  statuses?: { status?: string | null } | null
  totals?: { total?: RawGoDaddyMoney | null } | null
  lineItems?: RawGoDaddyLineItem[] | null
}

/** GraphQL selection for an `Order`, kept beside the type it fills. */
export const ORDER_FIELDS =
  'id number numberDisplay customerId createdAt updatedAt processedAt canceledAt tags transactionIds ' +
  'statuses { status } totals { total { value currencyCode } } ' +
  'lineItems { id name quantity skuId unitAmount { value currencyCode } }'

function toMoney(raw: RawGoDaddyMoney): Money {
  return { amount: raw.value, currency: raw.currencyCode }
}

/**
 * A line item maps only with the fields the canonical line item requires: a
 * display name, a whole quantity and a unit price. One that lacks any of them
 * cannot be represented without inventing a value, and a partial list would
 * misstate the order, so the order then carries no canonical `lineItems` (the
 * raw ones stay in metadata).
 */
function toLineItems(raw: RawGoDaddyLineItem[] | null | undefined): LineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  const out: LineItem[] = []
  for (const li of raw) {
    if (!li.name || !li.unitAmount) return undefined
    if (typeof li.quantity !== 'number' || !Number.isInteger(li.quantity) || li.quantity < 0) {
      return undefined
    }
    out.push({
      id: li.id,
      ...(li.skuId ? { variantId: li.skuId } : {}),
      title: li.name,
      quantity: li.quantity,
      price: toMoney(li.unitAmount),
      metadata: { ...li },
    })
  }
  return out
}

export function transformCommerceOrder(raw: RawGoDaddyOrder): Order {
  const total = raw.totals?.total
  const lineItems = toLineItems(raw.lineItems)
  const createdAt = toIsoDatetime(raw.createdAt)
  const updatedAt = toIsoDatetime(raw.updatedAt)
  const processedAt = toIsoDatetime(raw.processedAt)
  const cancelledAt = toIsoDatetime(raw.canceledAt)
  return {
    id: raw.id,
    ...(raw.number ? { orderNumber: raw.number } : {}),
    ...(raw.numberDisplay ? { name: raw.numberDisplay } : {}),
    ...(raw.customerId ? { customerId: raw.customerId } : {}),
    ...(total ? { currency: total.currencyCode, totalPrice: toMoney(total) } : {}),
    ...(lineItems ? { lineItems } : {}),
    ...(raw.transactionIds && raw.transactionIds.length > 0
      ? { transactionIds: raw.transactionIds }
      : {}),
    ...(raw.tags && raw.tags.length > 0 ? { tags: raw.tags } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(processedAt ? { processedAt } : {}),
    ...(cancelledAt ? { cancelledAt } : {}),
    metadata: { ...raw },
  }
}
