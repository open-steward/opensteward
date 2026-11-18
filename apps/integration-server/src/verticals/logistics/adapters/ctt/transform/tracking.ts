import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── CTT raw types ─────────────────────────────────────────────────────────
//
// POST /tracking/, "JSON reply data"
// (https://api.pakketmail.nl/v3/apidocs/usa/endpoints/tracking/POST):
//
//   Shipments sublist Always returned ... The result for each shipment in the request
//     ClientReferenceCode String Always returned ... The shipment reference or id
//     TrackingId String ... The tracking id of the shipment/order, if available
//     Statuslist sublist Always returned ... Tracking information list
//       Code Integer number Always returned ... Status code of the event
//       DateTime DateTime Always returned ... rfc3339 format, timezone UTC
//       Text String ... Textual description of the event
//
// A "sublist" is "A JSON object that has named items ... the values might be
// an array or sublist" (https://api.pakketmail.nl/v3/apidocs/usa/definitions),
// so both are read by their values.

export interface CttTrackingStatus {
  Code: number
  DateTime: string
  Text?: string
}

export interface CttTrackingShipment {
  ClientReferenceCode: string
  TrackingId?: string
  Statuslist?: Record<string, CttTrackingStatus> | CttTrackingStatus[]
}

export interface CttTrackingResponse {
  Shipments?: Record<string, CttTrackingShipment> | CttTrackingShipment[]
  Error?: { Id: number; Info?: string }
}

// ─── Status mapping ─────────────────────────────────────────────────────────
//
// https://api.pakketmail.nl/v3/apidocs/usa/idlists/statuscodes. Codes whose
// meaning is not a stage of the parcel's journey (9 plugin type, 11 user,
// 12 altered, 30 "without any special meaning", 40-44 shop updates, 70
// "general information", 97 cancelled, 98 deactivated) are UNKNOWN.

const STATUS_BY_CODE: Record<number, TrackingEventStatus> = {
  10: 'PRE_TRANSIT', // "The shipment was imported"
  20: 'PRE_TRANSIT', // "The shipment was pre-alerted to the carrier."
  21: 'FAILURE', // "There was an error pre-alerting the shipment to the carrier."
  22: 'FAILURE', // "There was an error requesting a pickup by the carrier."
  23: 'PRE_TRANSIT', // "A pickup was scheduled by the carrier at the given time and date."
  24: 'PRE_TRANSIT', // "If the carrier supplied it, this registers the pickup id."
  25: 'IN_TRANSIT', // "The shipment was picked up by the carrier, or the carrier did the first scan."
  26: 'FAILURE', // "There was an error generating the label for the shipment"
  31: 'FAILURE', // "Indicating an issue with the shipment."
  32: 'DELIVERED', // "Indicates that the shipment was set to 'delivered' manually."
  94: 'DELIVERED', // "The shipment has been delivered. This is done by the system instead of the carrier."
  95: 'AVAILABLE_FOR_PICKUP', // "The shipmens is ready for pickup at a servicepoint."
  96: 'FAILURE', // "The shipment processing is halted because of an incident (lost, never received, etc)."
  99: 'DELIVERED', // "Normal delivery."
}

export function mapTrackingStatus(code: number): TrackingEventStatus {
  return STATUS_BY_CODE[code] ?? 'UNKNOWN'
}

function values<T>(list: Record<string, T> | T[] | undefined): T[] {
  if (!list) return []
  return Array.isArray(list) ? list : Object.values(list)
}

// ─── Transform ──────────────────────────────────────────────────────────────

/**
 * Every status line of every shipment in a POST /tracking/ reply. The id is
 * built from documented fields only: the shipment's reference, the code and
 * the time of the event. No event is invented for a shipment with none.
 */
export function transformTracking(raw: CttTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = []
  for (const shipment of values(raw.Shipments)) {
    for (const s of values(shipment.Statuslist)) {
      events.push({
        id: `${shipment.ClientReferenceCode}:${s.Code}:${s.DateTime}`,
        trackingNumber: shipment.TrackingId || undefined,
        status: mapTrackingStatus(s.Code),
        description: s.Text || undefined,
        occurredAt: toISODate(s.DateTime),
        metadata: { ...s, ClientReferenceCode: shipment.ClientReferenceCode },
      })
    }
  }
  return events
}
