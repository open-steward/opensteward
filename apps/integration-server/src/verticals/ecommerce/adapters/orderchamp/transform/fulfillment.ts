/**
 * Orderchamp Shipment transform — create + mark-shipped.
 *
 * "The products in this request refers to the OrderProduct.ID as returned
 * by the Order query above. Not to the Product.ID" — so a canonical
 * `Fulfillment.lineItems[].lineItemId` maps to an Orderchamp OrderProduct
 * id. `isTracked` is a confirmed `shipmentShipped` input field ("If you
 * have no tracking details you can use isTracked: false"). The
 * delivery-estimate field `shipmentShipped` also needs ("you also need to
 * specify the time you estimate it will take for the shipment to arrive")
 * has no confirmed name and is deliberately not sent.
 *
 * `shipmentCreate`'s response is not confirmed to echo back `orderId`
 * (`Fulfillment.orderId` is a REQUIRED canonical field), so the returned
 * Fulfillment combines the mutation's `{ id }` with the request that
 * produced it — never a fabricated placeholder.
 *
 * Docs: https://developers.orderchamp.com/manage-orders-fulfilment
 */
import type { Fulfillment } from '../../../schema/fulfillment'

export interface RawOrderchampShipment {
  id: string
}

export interface OrderchampShipmentCreateInput {
  orderId: string
  products: Array<{ orderProductId: string; quantity: number }>
}

export function untransformFulfillment(data: Partial<Fulfillment>): OrderchampShipmentCreateInput {
  if (!data.orderId) throw new Error('createFulfillment requires orderId (the Orderchamp Order id)')
  const items = data.lineItems ?? []
  if (items.length === 0) {
    throw new Error('createFulfillment requires at least one lineItems entry (OrderProduct id + quantity).')
  }
  return {
    orderId: data.orderId,
    products: items.map((li) => ({ orderProductId: li.lineItemId, quantity: li.quantity })),
  }
}

export function transformFulfillment(
  raw: RawOrderchampShipment,
  request: OrderchampShipmentCreateInput,
): Fulfillment {
  return {
    id: String(raw.id),
    orderId: request.orderId,
    lineItems: request.products.map((p) => ({ lineItemId: p.orderProductId, quantity: p.quantity })),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export interface OrderchampShipmentShippedInput {
  shipmentId: string
  isTracked: boolean
  trackingNumber?: string
}

/** `shipmentShipped` input — marks a created shipment as dispatched. */
export function untransformShipmentShipped(id: string, data: Partial<Fulfillment>): OrderchampShipmentShippedInput {
  return {
    shipmentId: id,
    isTracked: Boolean(data.trackingNumber),
    ...(data.trackingNumber ? { trackingNumber: data.trackingNumber } : {}),
  }
}
