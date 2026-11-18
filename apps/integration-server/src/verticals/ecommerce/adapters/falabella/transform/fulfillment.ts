/**
 * Falabella order item → canonical Fulfillment.
 *
 * Falabella has no standalone fulfillment resource — `GetOrderItems` (docs:
 * https://developers.falabella.com/docs/orders/getorderitems) carries
 * `ShipmentProvider`/`TrackingCode`/`Status` per item (confirmed verbatim —
 * see `transform/order.ts`), and `SetStatusToReadyToShip` (docs:
 * https://developers.falabella.com/docs/orders-flow, confirmed params:
 * `OrderItemId`) is the seller action that starts a shipment. This adapter
 * therefore derives fulfillments from order items, keyed
 * `${orderId}:${orderItemId}`.
 *
 * Status vocabulary carries the same confidence split as
 * `transform/order.ts`: `pending` is confirmed live; `ready_to_ship` is
 * confirmed as the action Falabella exposes to reach it; `shipped`/
 * `delivered`/`canceled` are this API family's well-established (not,
 * on the pages fetched, item-level-example-confirmed) vocabulary.
 */
import type { Fulfillment } from '../../../schema/fulfillment'
import type { RawFalabellaOrderItem } from './order'

function mapStatus(status: string): Fulfillment['status'] {
  switch (status) {
    case 'pending':
      return 'PENDING'
    case 'ready_to_ship':
      return 'OPEN'
    case 'shipped':
    case 'delivered':
      return 'SUCCESS'
    case 'canceled':
      return 'CANCELLED'
    default:
      return 'unknown'
  }
}

export function transformFulfillment(raw: RawFalabellaOrderItem): Fulfillment {
  return {
    id: `${raw.OrderId}:${raw.OrderItemId}`,
    orderId: raw.OrderId,
    status: mapStatus(raw.Status),
    trackingNumber: raw.TrackingCode || undefined,
    carrier: raw.ShipmentProvider,
    lineItems: [{ lineItemId: raw.OrderItemId, quantity: 1 }],
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformFulfillments(items: RawFalabellaOrderItem[]): Fulfillment[] {
  return items.map(transformFulfillment)
}
