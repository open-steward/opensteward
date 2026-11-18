/**
 * ePages Beyond shipping process ↔ canonical Fulfillment.
 *
 * Confirmed (https://api-docs.beyondshop.cloud/ng-order-order-public-api.html,
 * "shipping processes" — `/api/orders/{orderId}/processes/shippings`):
 *   - `POST .../shippings` body: `comment`, `sendMail`, `createPackingSlip`,
 *     `trackingCode`, `trackingLink`, `lineItems[].{productLineItemId,quantity}`.
 *   - `POST .../shippings/{id}/mark-shipped` body: `comment`,
 *     `details.{sendMail,trackingCode,trackingLink}`.
 *   - `POST .../shippings/{id}/mark-delivered`.
 *   - Status enum: `PENDING` | `SHIPPED` | `DELIVERED`.
 *
 * The GET/list representation is not independently documented beyond these
 * same fields (`_id`, `status`, `trackingCode`, `trackingLink`, `comment`,
 * `lineItems`) — this adapter reads back only what it itself writes.
 */
import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

export interface RawEpagesShippingLineItem {
  productLineItemId: string
  quantity: number
}

export interface RawEpagesShippingProcess {
  _id: string
  status?: string
  trackingCode?: string
  trackingLink?: string
  comment?: string
  lineItems?: RawEpagesShippingLineItem[]
  [key: string]: unknown
}

const STATUS: Record<string, FulfillmentStatus> = {
  PENDING: 'PENDING',
  SHIPPED: 'SUCCESS',
  DELIVERED: 'SUCCESS',
}

export function transformFulfillment(raw: RawEpagesShippingProcess, orderId: string): Fulfillment {
  return {
    id: raw._id,
    orderId,
    status: raw.status ? (STATUS[raw.status] ?? 'unknown') : undefined,
    trackingNumber: raw.trackingCode,
    trackingUrl: raw.trackingLink,
    lineItems: raw.lineItems?.map((li) => ({ lineItemId: li.productLineItemId, quantity: li.quantity })),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Body for `POST /api/orders/{orderId}/processes/shippings`. */
export function untransformFulfillment(data: Partial<Fulfillment>): Record<string, unknown> {
  if (!data.lineItems || data.lineItems.length === 0) {
    throw new Error(
      'ePages Beyond createFulfillment requires `lineItems` (each with a `lineItemId` and `quantity`).',
    )
  }
  return {
    trackingCode: data.trackingNumber,
    trackingLink: data.trackingUrl,
    sendMail: data.notifyCustomer,
    lineItems: data.lineItems.map((li) => ({
      productLineItemId: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
