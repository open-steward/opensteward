import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { child, textOf, parseZonedTimestamp, type XmlNode } from '../xml'

// ─── Parcelhub tracking history ─────────────────────────────────────────────
// POST /v1/trackingservice/gettrackinghistory
// (https://api.parcelhub.net/docs/trackingAPI/get-tracking-history/) returns a
// <GetTrackingHistoryResponse> with ServiceResult, ShipmentKey, CourierName,
// TrackingNumber, ShipmentTrackingEvents and Packages/Package, each package with
// TrackingNumber and PackageTrackingEvents/TrackingEvent. An event carries
// EventCategoryID, EventCategoryDescription, EventSubCategoryID,
// EventSubCategoryDescription, EventLocation, EventDescription, EventSignatory,
// EventTimestamp, Longitude, Latitude, CourierTrackingEventCode,
// WhistlNormalisedEventCode and EventComments.
//
// EventTimestamp has no zone offset in the docs' example (2025-04-08T09:21:48)
// and the docs name no zone, so occurredAt is set only when the value carries
// its own offset; the raw value is always kept in metadata.

// Category and sub-category ids from the "Tracking Event List" appendix,
// https://api.parcelhub.net/docs/trackingAPI-Manual/tracking-events/ :
//   1 Delivered (47 "Delivered col. point", 83 "Return - Delivered")
//   2 Delayed
//   3 In-Transit (17 "Out for delivery", 82 "Return - In Transit",
//     88 "Return - Customer Drop To Store", 89 "Return - Collect From Home")
//   4 Problem (48 "Returned to sender")
//   5 Customer Action
//   7 Information (54 "Shipment Created")
//   8 Advised to claim
function mapStatus(category: string | undefined, sub: string | undefined): TrackingEventStatus {
  switch (category) {
    case '1':
      if (sub === '47') return 'AVAILABLE_FOR_PICKUP'
      if (sub === '83') return 'RETURN_TO_SENDER'
      return 'DELIVERED'
    case '2':
      return 'IN_TRANSIT'
    case '3':
      if (sub === '17') return 'OUT_FOR_DELIVERY'
      if (sub === '82' || sub === '88' || sub === '89') return 'RETURN_TO_SENDER'
      return 'IN_TRANSIT'
    case '4':
      if (sub === '48') return 'RETURN_TO_SENDER'
      return 'FAILURE'
    case '7':
      if (sub === '54') return 'PRE_TRANSIT'
      return 'UNKNOWN'
    case '8':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

function transformEvent(
  evt: XmlNode,
  trackingNumber: string | undefined,
  shipmentKey: string | undefined,
  courierName: string | undefined,
): TrackingEvent {
  const timestamp = textOf(evt, 'EventTimestamp')
  return {
    shipmentId: shipmentKey,
    trackingNumber,
    status: mapStatus(textOf(evt, 'EventCategoryID'), textOf(evt, 'EventSubCategoryID')),
    description: textOf(evt, 'EventDescription'),
    occurredAt: parseZonedTimestamp(timestamp),
    metadata: {
      courierName,
      eventCategoryId: textOf(evt, 'EventCategoryID'),
      eventCategoryDescription: textOf(evt, 'EventCategoryDescription'),
      eventSubCategoryId: textOf(evt, 'EventSubCategoryID'),
      eventSubCategoryDescription: textOf(evt, 'EventSubCategoryDescription'),
      eventLocation: textOf(evt, 'EventLocation'),
      eventSignatory: textOf(evt, 'EventSignatory'),
      eventTimestamp: timestamp,
      courierTrackingEventCode: textOf(evt, 'CourierTrackingEventCode'),
      whistlNormalisedEventCode: textOf(evt, 'WhistlNormalisedEventCode'),
      eventComments: textOf(evt, 'EventComments'),
    },
  }
}

/** Throw the documented ServiceResult error when the request did not succeed. */
export function assertServiceResult(response: XmlNode): void {
  const result = child(response, 'ServiceResult')
  if (textOf(result, 'Success') === 'true') return
  const code = textOf(result, 'ErrorCode')
  const message = textOf(result, 'ErrorMessage') ?? 'no ErrorMessage'
  throw new Error(`Parcelhub Tracking API error${code ? ` ${code}` : ''}: ${message}`)
}

/** Every shipment-level and package-level event of one tracking history response. */
export function transformTrackingHistory(response: XmlNode): TrackingEvent[] {
  const shipmentKey = textOf(response, 'ShipmentKey')
  const courierName = textOf(response, 'CourierName')
  const events: TrackingEvent[] = []
  for (const evt of child(response, 'ShipmentTrackingEvents')?.children ?? []) {
    events.push(transformEvent(evt, textOf(response, 'TrackingNumber'), shipmentKey, courierName))
  }
  for (const pkg of child(response, 'Packages')?.children ?? []) {
    const pkgTracking = textOf(pkg, 'TrackingNumber')
    for (const evt of child(pkg, 'PackageTrackingEvents')?.children ?? []) {
      events.push(transformEvent(evt, pkgTracking, shipmentKey, courierName))
    }
  }
  return events
}
