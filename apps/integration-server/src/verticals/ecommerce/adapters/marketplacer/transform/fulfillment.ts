/**
 * Marketplacer Shipment (dispatch) transform — create only.
 *
 * `shipmentCreate`'s response is minimal: `{ errors { field messages },
 * shipment { id } }` — no echoed tracking number, carrier, or line items
 * (see docs/seller-api/reference/mutations/shipmentcreate/). The canonical
 * Fulfillment this adapter returns therefore combines that `id` with the
 * values the caller supplied, since Marketplacer will not hand them back.
 *
 * `postageCarrierId` is a mandatory, operator-configured carrier reference
 * (resolved via the `shipmentCarriers` query — see
 * docs/seller-api/examples/shipping/creating_shipments/) that the canonical
 * `Fulfillment.carrier` free-text field has no slot for; callers supply it
 * via `metadata.postageCarrierId`, the same convention used for
 * `brandId`/`taxonId` on products.
 *
 * Docs: https://api.marketplacer.com/docs/seller-api/reference/mutations/shipmentcreate/
 *       https://api.marketplacer.com/docs/seller-api/examples/shipping/creating_shipments/
 */
import type { Fulfillment } from '../../../schema/fulfillment'

export interface RawMarketplacerShipment {
  id: string
}

export interface MarketplacerShipmentCreateInput {
  invoiceId: string
  dispatchedAt: string
  note?: string
  postageCarrierId: string
  trackingNumber?: string
  shippedItems: Array<{ lineItemId: string; quantity: number }>
}

export function untransformFulfillment(data: Partial<Fulfillment>): MarketplacerShipmentCreateInput {
  if (!data.orderId) throw new Error('createFulfillment requires orderId (the Marketplacer Invoice id)')
  const meta = data.metadata as Record<string, unknown> | undefined
  const postageCarrierId = meta?.['postageCarrierId']
  if (!postageCarrierId) {
    throw new Error(
      'createFulfillment requires metadata.postageCarrierId — look it up first via the ' +
        '`shipmentCarriers` query (Marketplacer has no free-text carrier field).',
    )
  }
  const items = data.lineItems ?? []
  if (items.length === 0) {
    throw new Error('createFulfillment requires at least one lineItems entry to dispatch.')
  }
  return {
    invoiceId: data.orderId,
    dispatchedAt: data.shippedAt ?? new Date().toISOString(),
    note: data.metadata?.['note'] as string | undefined,
    postageCarrierId: String(postageCarrierId),
    trackingNumber: data.trackingNumber,
    shippedItems: items.map((li) => ({ lineItemId: li.lineItemId, quantity: li.quantity })),
  }
}

/** Combines the minimal `shipmentCreate` response with the request that produced it. */
export function transformFulfillment(
  raw: RawMarketplacerShipment,
  request: MarketplacerShipmentCreateInput,
): Fulfillment {
  return {
    id: String(raw.id),
    orderId: request.invoiceId,
    status: 'SUCCESS',
    trackingNumber: request.trackingNumber,
    shippedAt: request.dispatchedAt,
    lineItems: request.shippedItems.map((si) => ({
      lineItemId: si.lineItemId,
      quantity: si.quantity,
    })),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
