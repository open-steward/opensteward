import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

// ── Raw Ship24 types ─────────────────────────────────────────────────────────

export interface Ship24Event {
  eventId: string | null
  trackingNumber: string | null
  eventTrackingNumber: string | null
  status: string | null
  occurrenceDatetime: string | null
  order: number | null
  location: string | null
  sourceCode: string | null
  courierCode: string | null
  statusCode: string | null
  statusCategory: string | null
  statusMilestone: string | null
  [key: string]: unknown
}

export interface Ship24Recipient {
  name: string | null
  address: string | null
  postCode: string | null
  city: string | null
  subdivision: string | null
  [key: string]: unknown
}

export interface Ship24Shipment {
  shipmentId: string | null
  statusCode: string | null
  statusCategory: string | null
  statusMilestone: string | null
  originCountryCode: string | null
  destinationCountryCode: string | null
  delivery: {
    estimatedDeliveryDate: string | null
    service: string | null
    signedBy: string | null
  } | null
  trackingNumbers: Array<{ tn: string }> | null
  recipient: Ship24Recipient | null
  [key: string]: unknown
}

export interface Ship24Statistics {
  timestamps: {
    infoReceivedDatetime: string | null
    inTransitDatetime: string | null
    outForDeliveryDatetime: string | null
    failedAttemptDatetime: string | null
    availableForPickupDatetime: string | null
    exceptionDatetime: string | null
    deliveredDatetime: string | null
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

export interface Ship24Tracker {
  trackerId: string
  trackingNumber: string
  shipmentReference: string | null
  clientTrackerId: string | null
  isSubscribed: boolean
  isTracked: boolean
  createdAt: string
  [key: string]: unknown
}

export interface Ship24TrackingResult {
  tracker: Ship24Tracker
  shipment: Ship24Shipment | null
  events: Ship24Event[]
  statistics: Ship24Statistics | null
  [key: string]: unknown
}

// ── Status mappers ────────────────────────────────────────────────────────────

function mapMilestoneToTrackingEventStatus(milestone: string | null | undefined): TrackingEventStatus {
  switch (milestone) {
    case 'info_received':          return 'PRE_TRANSIT'
    case 'in_transit':             return 'IN_TRANSIT'
    case 'out_for_delivery':       return 'OUT_FOR_DELIVERY'
    case 'failed_attempt':         return 'FAILURE'
    case 'available_for_pickup':   return 'AVAILABLE_FOR_PICKUP'
    case 'exception':              return 'FAILURE'
    case 'delivered':              return 'DELIVERED'
    default:                       return 'UNKNOWN'
  }
}

function mapMilestoneToShipmentStatus(milestone: string | null | undefined): ShipmentStatus {
  switch (milestone) {
    case 'info_received':          return 'LABEL_CREATED'
    case 'in_transit':             return 'IN_TRANSIT'
    case 'out_for_delivery':       return 'OUT_FOR_DELIVERY'
    case 'failed_attempt':         return 'EXCEPTION'
    case 'available_for_pickup':   return 'IN_TRANSIT'
    case 'exception':              return 'EXCEPTION'
    case 'delivered':              return 'DELIVERED'
    default:                       return 'UNKNOWN'
  }
}

// ── Location parser ───────────────────────────────────────────────────────────

function parseEventLocation(location: string | null | undefined): Address | undefined {
  if (!location) return undefined
  // location is a free-text string like "City, State, Country"
  const parts = location.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length === 0) return undefined
  if (parts.length === 1) return { city: parts[0] }
  if (parts.length === 2) return { city: parts[0], country: parts[1] }
  return { city: parts[0], state: parts[1], country: parts[2] }
}

// ── Transforms ────────────────────────────────────────────────────────────────

/**
 * Convert a Ship24 tracking result into canonical TrackingEvent[].
 * One event per Ship24 event, ordered by occurrence datetime.
 */
export function transformTrackingEvents(raw: Ship24TrackingResult): TrackingEvent[] {
  const { tracker, events } = raw
  const events_ = events ?? []

  if (events_.length === 0) {
    // Return a single stub event based on the current milestone
    return [
      {
        trackingNumber: tracker.trackingNumber ?? undefined,
        carrierId: raw.shipment?.statusCategory ?? undefined,
        status: mapMilestoneToTrackingEventStatus(raw.shipment?.statusMilestone),
        createdAt: toISODate(tracker.createdAt),
        metadata: raw as unknown as Record<string, unknown>,
      },
    ]
  }

  return events_.map((ev) => ({
    trackingNumber: ev.trackingNumber ?? tracker.trackingNumber ?? undefined,
    carrierId: ev.courierCode ?? undefined,
    status: mapMilestoneToTrackingEventStatus(ev.statusMilestone),
    description: ev.status ?? undefined,
    location: parseEventLocation(ev.location),
    occurredAt: toISODate(ev.occurrenceDatetime),
    createdAt: toISODate(tracker.createdAt),
    metadata: ev as unknown as Record<string, unknown>,
  }))
}

/**
 * Convert a Ship24 tracking result into a canonical Shipment.
 */
export function transformShipment(raw: Ship24TrackingResult): Shipment {
  const { tracker, shipment } = raw
  const recipient = shipment?.recipient ?? null
  const delivery = shipment?.delivery ?? null

  const destinationAddress: Address | undefined =
    recipient
      ? {
          name: recipient.name ?? undefined,
          city: recipient.city ?? undefined,
          state: recipient.subdivision ?? undefined,
          postalCode: recipient.postCode ?? undefined,
          country: shipment?.destinationCountryCode ?? undefined,
        }
      : shipment?.destinationCountryCode
        ? { country: shipment.destinationCountryCode }
        : undefined

  const originAddress: Address | undefined = shipment?.originCountryCode
    ? { country: shipment.originCountryCode }
    : undefined

  return {
    id: tracker.trackerId ?? undefined,
    status: mapMilestoneToShipmentStatus(shipment?.statusMilestone),
    trackingNumber: tracker.trackingNumber ?? undefined,
    serviceCode: delivery?.service ?? undefined,
    reference: tracker.shipmentReference ?? tracker.clientTrackerId ?? undefined,
    originAddress,
    destinationAddress,
    estimatedDeliveryAt: toISODate(delivery?.estimatedDeliveryDate),
    createdAt: toISODate(tracker.createdAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
