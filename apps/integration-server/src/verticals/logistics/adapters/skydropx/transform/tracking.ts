import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'

/**
 * The tracking-status vocabulary of the Skydropx PRO API. POST
 * /api/v1/shipments/tracking ("Reportar evento de tracking") documents it as an
 * enum: "Estado a reportar — `created`, `picked_up`, `in_transit`,
 * `last_mile`, `delivery_attempt`, `delivered_to_branch`, `delivered`,
 * `exception`, `in_return`, `canceled`, `destroyed`, `retained`."
 * The same codes are what a package's `tracking_status` and a tracking
 * event's `status` ("Código del estado", example "last_mile") carry.
 */
export const SKYDROPX_TRACKING_STATUSES = [
  'created',
  'picked_up',
  'in_transit',
  'last_mile',
  'delivery_attempt',
  'delivered_to_branch',
  'delivered',
  'exception',
  'in_return',
  'canceled',
  'destroyed',
  'retained',
] as const

export type SkydropxTrackingStatus = (typeof SKYDROPX_TRACKING_STATUSES)[number]

const EVENT_STATUS: Record<SkydropxTrackingStatus, TrackingEventStatus> = {
  created: 'PRE_TRANSIT',
  picked_up: 'IN_TRANSIT',
  in_transit: 'IN_TRANSIT',
  last_mile: 'OUT_FOR_DELIVERY',
  delivery_attempt: 'FAILURE',
  delivered_to_branch: 'AVAILABLE_FOR_PICKUP',
  delivered: 'DELIVERED',
  exception: 'FAILURE',
  in_return: 'RETURN_TO_SENDER',
  canceled: 'UNKNOWN',
  destroyed: 'FAILURE',
  retained: 'UNKNOWN',
}

export function isSkydropxTrackingStatus(v: unknown): v is SkydropxTrackingStatus {
  return typeof v === 'string' && (SKYDROPX_TRACKING_STATUSES as readonly string[]).includes(v)
}

/**
 * A timestamp only when it says which instant it is. The docs give no zone
 * for the PRO API's timestamps (the tracking example is "2024-09-05T23:13:00",
 * with no offset), and `new Date()` would read such a string in the server's
 * local zone, so it would name a different instant on every host. Strings
 * without a `Z` or `±hh:mm` offset are left out; the raw value stays in
 * `metadata`.
 */
export function parseZonedDate(v: unknown): Date | undefined {
  if (typeof v !== 'string') return undefined
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(v))
    return undefined
  const d = new Date(v)
  return isNaN(d.getTime()) ? undefined : d
}

/**
 * One event of GET /api/v1/shipments/tracking?tracking_number=…&carrier_name=…
 * ("Retorna la lista de los eventos ocurridos"):
 *
 *   id          "UUID del evento de rastreo"
 *   attributes.description       "Descripción del estado"
 *   attributes.location          "Ubicación donde ocurrio el evento"
 *   attributes.date              "Fecha del evento" (date-time)
 *   attributes.status            "Código del estado"
 *   attributes.event_description "Descripción del evento informada por el carrier"
 */
export interface SkydropxTrackingEvent {
  id?: string
  type?: string
  attributes?: {
    description?: string | null
    location?: string | null
    date?: string | null
    status?: string | null
    event_description?: string | null
  }
}

export interface SkydropxTrackingResponse {
  data?: SkydropxTrackingEvent[]
}

export function transformTrackingEvent(
  raw: SkydropxTrackingEvent,
  trackingNumber: string,
  carrierName: string,
): TrackingEvent {
  const a = raw.attributes ?? {}
  return {
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : undefined,
    trackingNumber,
    carrierId: carrierName,
    status: isSkydropxTrackingStatus(a.status) ? EVENT_STATUS[a.status] : 'UNKNOWN',
    description:
      typeof a.event_description === 'string' && a.event_description !== ''
        ? a.event_description
        : undefined,
    occurredAt: parseZonedDate(a.date),
    metadata: raw as Record<string, unknown>,
  }
}
