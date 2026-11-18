/**
 * KORONA CustomerOrder → canonical Order.
 *
 * Shape verified against `components.schemas.CustomerOrder` and
 * `CustomerOrderItem` on
 * https://128.koronacloud.com/web/api/v3/openapi.json.
 *
 * No `lineItems`: `CustomerOrderItem.total` (`TotalPrice`, presumably
 * gross/net like `ReceiptTotal`) carries no currency, and the canonical
 * `LineItem.price` is a required `Money` field — see `transform/product.ts`
 * for the platform-wide reasoning. No `financialStatus`/`fulfillmentStatus`
 * either: `CustomerOrder` has no status field of any kind (only booleans
 * like `readyForPickUp`, which describes a narrower "ready for customer
 * pickup" concept that doesn't correspond to the canonical enums).
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Order } from '../../../schema/order'
import type { KoronaModelReference } from './product'

export interface KoronaCustomerOrder {
  id: string
  number?: string
  comment?: string
  customer?: KoronaModelReference
  createTime?: string
  finishTime?: string
}

export function transformOrder(raw: KoronaCustomerOrder): Order {
  return {
    id: raw.id,
    orderNumber: raw.number,
    name: raw.number ? `#${raw.number}` : undefined,
    customerId: raw.customer?.id,
    note: raw.comment || undefined,
    createdAt: toIsoDatetime(raw.createTime),
    processedAt: toIsoDatetime(raw.finishTime),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Order → KORONA body for `POST /customerOrders` (add,
 * array-batched) / `PATCH /customerOrders/{id}` (edit). Line items are
 * written as `{ product, quantity }` only — KORONA computes `total` itself
 * (`CustomerOrderItem.manualPrice` is what opts into a manual override,
 * which this adapter never sets).
 */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (order.note) body['comment'] = order.note
  if (order.customerId) body['customer'] = { id: order.customerId }
  if (order.lineItems && order.lineItems.length > 0) {
    body['items'] = order.lineItems
      .filter((li) => li.productId != null)
      .map((li) => ({ product: { id: li.productId }, quantity: li.quantity }))
  }
  return body
}
