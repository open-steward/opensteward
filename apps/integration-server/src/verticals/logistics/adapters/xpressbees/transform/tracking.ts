import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'

/**
 * "Track Shipment" (GET https://shipment.xpressbees.com/api/shipments2/track/{AWB},
 * https://documenter.getpostman.com/view/15188467/2s9YyzcxWT and
 * apidoc_v1.1.5.pdf). One `history` row:
 * `{ "status_code": "PP", "location": "...", "event_time": "2024-02-10 00:40", "message": "Out For Pickup" }`.
 */
export interface XpressbeesTrackHistoryRaw {
  status_code?: string | null
  location?: string | null
  event_time?: string | null
  message?: string | null
}

export interface XpressbeesTrackData {
  id?: string | null
  order_id?: string | null
  order_number?: string | null
  created?: string | null
  awb_number?: string | null
  courier_id?: string | null
  status?: string | null
  history?: XpressbeesTrackHistoryRaw[] | null
  [key: string]: unknown
}

export interface XpressbeesTrackResponse {
  status?: boolean | null
  data?: XpressbeesTrackData | null
  message?: string | null
}

/**
 * apidoc_v1.1.5.pdf, "Response Status Codes": PP Pending Pickup, IT In Transit,
 * EX Exception, FD Out For Delivery, DL Delivered, RT RTO, RT-IT RTO In Transit,
 * RT-DL RTO Delivered.
 */
const STATUS_CODES: Record<string, TrackingEventStatus> = {
  PP: 'PRE_TRANSIT',
  IT: 'IN_TRANSIT',
  EX: 'FAILURE',
  FD: 'OUT_FOR_DELIVERY',
  DL: 'DELIVERED',
  RT: 'RETURN_TO_SENDER',
  'RT-IT': 'RETURN_TO_SENDER',
  'RT-DL': 'RETURN_TO_SENDER',
}

export function mapStatusCode(code: string | null | undefined): TrackingEventStatus {
  return (code && STATUS_CODES[code.toUpperCase()]) || 'UNKNOWN'
}

/**
 * One event per documented `history` row, and none when the history is empty
 * (the shipment's current `status` is not an event).
 *
 * `event_time` ("2024-02-10 00:40") carries no time zone and the docs name
 * none, so it is not turned into `occurredAt`: it stays on `metadata`.
 * `location` is one free-text string ("Muzaffarnagar, Muzaffarnagar, UTTAR
 * PRADESH") that does not split into address fields, and stays there too.
 *
 * Event ids are built from the AWB, `event_time` and `status_code`; a repeat
 * within one history gets a `:2`, `:3`... suffix.
 */
export function transformTracking(data: XpressbeesTrackData, awb: string): TrackingEvent[] {
  const seen = new Map<string, number>()
  return (data.history ?? []).map((evt) => {
    const base = `${awb}:${evt.event_time ?? ''}:${evt.status_code ?? ''}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return {
      id: n === 1 ? base : `${base}:${n}`,
      shipmentId: data.id ?? undefined,
      trackingNumber: awb,
      carrierId: 'xpressbees',
      status: mapStatusCode(evt.status_code),
      description: evt.message ?? undefined,
      metadata: evt as Record<string, unknown>,
    }
  })
}
