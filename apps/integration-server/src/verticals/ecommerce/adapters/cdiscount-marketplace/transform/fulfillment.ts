/**
 * Octopia shipment → canonical Fulfillment.
 *
 * Octopia has no standalone fulfillment resource: `POST
 * /orders/{orderId}/shipments` (docs:
 * https://developer.octopia-io.net/api-reference/orders-management/)
 * confirms a shipment for one or more order lines, and the confirmed parcel
 * — verbatim per the docs' own example, `{ "parcelNumber": "34GFRTG43",
 * "carrierName": "Chronopost", "trackingUrl": "...", "trackingId":
 * "deabfa7c-..." }` — is then embedded back on each `GET /orders/{orderId}`
 * line's `parcels[]`. This adapter therefore derives `list`/`get`
 * fulfillments from order lines — the same pattern used for orders without
 * a store-wide list endpoint in other marketplace adapters (see shopify's
 * `listFulfillments`).
 *
 * Fulfillment id is synthetic: `${orderId}:${parcelNumber}`.
 */
import type { Fulfillment } from '../../../schema/fulfillment'
import type { RawOctopiaOrder, RawOctopiaOrderLine, RawOctopiaParcel } from './order'

/**
 * The docs' own `trackingUrl` example ("www.trackingUrl.com/34GFRTG43") has
 * no scheme — `FulfillmentSchema.trackingUrl` requires an absolute URL, so a
 * bare-domain value is given an `https://` scheme rather than dropped.
 */
function normaliseTrackingUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

function parcelToFulfillment(
  orderId: string,
  line: RawOctopiaOrderLine,
  parcel: RawOctopiaParcel,
): Fulfillment {
  return {
    id: `${orderId}:${parcel.parcelNumber}`,
    orderId,
    // A parcel only appears once Octopia has accepted the shipment
    // confirmation, so its mere presence means the shipment succeeded.
    status: 'SUCCESS',
    trackingNumber: parcel.trackingId,
    trackingUrl: normaliseTrackingUrl(parcel.trackingUrl),
    carrier: parcel.carrierName,
    lineItems: [{ lineItemId: line.orderLineId, quantity: line.quantity }],
    metadata: parcel as unknown as Record<string, unknown>,
  }
}

/** Every parcel across every line of one order, as canonical fulfillments. */
export function transformFulfillmentsFromOrder(raw: RawOctopiaOrder): Fulfillment[] {
  const out: Fulfillment[] = []
  for (const line of raw.lines) {
    for (const parcel of line.parcels ?? []) {
      out.push(parcelToFulfillment(raw.orderId, line, parcel))
    }
  }
  return out
}

/**
 * Body for `POST /orders/{orderId}/shipments` — one parcel confirmation per
 * array entry. `parcelNumber` and `carrierName` are mandatory per the docs;
 * `trackingUrl` and `orderLineIds` are optional.
 */
export function untransformFulfillment(data: {
  trackingNumber?: string
  carrier?: string
  trackingUrl?: string
  lineItems?: Array<{ lineItemId: string }>
}): Record<string, unknown>[] {
  if (!data.trackingNumber || !data.carrier) {
    throw new Error(
      'Octopia createFulfillment requires both trackingNumber (used as parcelNumber) and carrier.',
    )
  }
  return [
    {
      parcelNumber: data.trackingNumber,
      carrierName: data.carrier,
      ...(data.trackingUrl ? { trackingUrl: data.trackingUrl } : {}),
      ...(data.lineItems && data.lineItems.length > 0
        ? { orderLineIds: data.lineItems.map((li) => li.lineItemId) }
        : {}),
    },
  ]
}
