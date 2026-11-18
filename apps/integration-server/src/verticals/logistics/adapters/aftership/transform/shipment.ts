import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'
import type { AfterShipTracking } from './tracking'

// AfterShip Tracking API 2024-10 — GET /trackings, GET /trackings/:id
// Docs: https://www.aftership.com/docs/tracking/2024-10/quickstart
//
// AfterShip has no shipment resource of its own. A *tracking* is the shipment
// record — one per tracking number, carrying origin/destination, EDD, delivery
// date and the merchant's order reference — so the shipment surface reads the
// same `trackings` collection the trackingevent surface does. `transformTracker`
// explodes a tracking's checkpoints into events; this maps the top-level record.

// AfterShip's `tag` enum is closed (nine values, spec-enumerated). Every value
// is listed so an addition upstream lands on `default` and is visible as
// UNKNOWN rather than silently absorbed by a neighbouring case.
function mapShipmentStatus(tag: string): ShipmentStatus {
  switch (tag) {
    case 'Pending':
      return 'PENDING'
    case 'InfoReceived':
      return 'LABEL_CREATED'
    case 'InTransit':
      return 'IN_TRANSIT'
    case 'OutForDelivery':
      return 'OUT_FOR_DELIVERY'
    case 'AvailableForPickup':
      // Same reading as easypost's `available_for_pickup`: the last mile is
      // done and the parcel is waiting on the recipient.
      return 'OUT_FOR_DELIVERY'
    case 'Delivered':
      return 'DELIVERED'
    case 'AttemptFail':
      return 'EXCEPTION'
    case 'Exception':
      return 'EXCEPTION'
    case 'Expired':
      // No carrier update for 30 days, so AfterShip stopped polling. That says
      // nothing about where the parcel is — it is not an exception, it is
      // unknown.
      return 'UNKNOWN'
    default:
      return 'UNKNOWN'
  }
}

/**
 * Origin and destination are flat `origin_*` / `destination_*` columns on the
 * tracking, not nested objects, so they are re-keyed into the shape `toAddress`
 * reads. `country` is deliberately left out: AfterShip reports
 * `*_country_iso3` as ISO 3166-1 alpha-3 (`USA`, `DEU`) and the canonical
 * `AddressSchema.country` is `Iso3166Alpha2`, which rejects a three-letter
 * code. The raw code is still on `metadata` for a caller that wants it.
 */
function toEndpointAddress(
  city: string | null,
  state: string | null,
  postalCode: string | null,
): Shipment['originAddress'] {
  return toAddress({ city, state, postal_code: postalCode })
}

export function transformShipment(raw: AfterShipTracking): Shipment {
  return {
    id: raw.id,
    // `return_to_sender` is AfterShip's own derived flag — true once any
    // checkpoint carries subtag Exception_010 (returning to sender) or
    // Exception_011 (returned to sender). The tag alone reports both as a bare
    // Exception, which is the one canonical state a returned parcel is not.
    status: raw.return_to_sender ? 'RETURNED' : mapShipmentStatus(raw.tag),
    trackingNumber: raw.tracking_number,
    // `slug` is the courier code (`usps`, `dhl`) and doubles as Carrier.id in
    // transform/carrier.ts, so this joins back to listCarriers.
    carrierId: raw.slug ?? undefined,
    serviceCode: raw.shipment_type ?? undefined,
    originAddress: toEndpointAddress(raw.origin_city, raw.origin_state, raw.origin_postal_code),
    destinationAddress: toEndpointAddress(
      raw.destination_city,
      raw.destination_state,
      raw.destination_postal_code,
    ),
    // Carrier-provided dates arrive as `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm:ss` (in
    // the recipient's timezone, no offset) or `YYYY-MM-DDTHH:mm:ssZ`, per the
    // spec. `toISODate` accepts all three; the offset-less form is zoned by
    // the server, which is the best available reading without the recipient's
    // timezone.
    estimatedDeliveryAt: toISODate(raw.latest_estimated_delivery?.datetime),
    actualDeliveryAt: toISODate(raw.shipment_delivery_date),
    reference: raw.order_id ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
