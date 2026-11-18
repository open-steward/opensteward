/**
 * Metapack — Tracking events from the Tracking API's parcel journeys.
 *
 * Tracking API 1.0.13 (https://dev.metapack.com/tracking/reference/tracking/overview/):
 *   GET /parcel-journeys — "A parcel journey contains the full tracking history
 *   related to the delivery of a parcel." 200: an array of `ParcelJourney`,
 *   each with `trackingEvents` (array of `TrackingEvent`) and
 *   `parcel.deliveryLegs` (array of `ParcelDeliveryLeg`).
 *
 * TrackingEvent fields read here: `trackingIdentifier`, `eventCode`
 * ("Metapack event code."), `eventDate` ("Date and time when the event
 * occured."), `eventDescription`, `statusCode` (enum below) and
 * `eventLocation.address` (`Address`). Address.countryCode is "ISO 3166-1
 * alpha-3", so it is not mapped to the alpha-2 canonical country.
 */

import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface MetapackAddress {
  addressLine1?: string
  addressLine2?: string
  postCode?: string
  countryCode?: string
  companyName?: string
  city?: string
  stateProvince?: string
  timeZone?: string
}

export interface MetapackTrackingEvent {
  trackingIdentifier?: string
  deliveryRef?: string
  eventCode?: string
  eventDate?: string
  eventSource?: string
  eventTimeZone?: string
  eventLocation?: { address?: MetapackAddress; location?: Record<string, unknown> }
  eventDescription?: string
  eventCategory?: string
  exceptionMessage?: string
  statusCode?: string
  statusDescription?: string
}

export interface MetapackDeliveryLeg {
  carrierCode?: string
  carrierDisplayName?: string
  carrierServiceCode?: string
  carrierTrackingURL?: string
  finalDeliveryLeg?: boolean
  trackingIdentifier?: string
}

export interface MetapackParcelJourney {
  parcel?: { deliveryRef?: string; parcelRef?: string; deliveryLegs?: MetapackDeliveryLeg[] }
  latestTrackingStatus?: MetapackTrackingEvent
  trackingEvents?: MetapackTrackingEvent[]
  [key: string]: unknown
}

/**
 * `statusCode`: "This is used to define the stage of a parcel journey when an
 * event occurred." Return-flow stages (RETURN_CREATED ... RETURN_DECLINED) and
 * CANCELLED_BEFORE_DESPATCH have no canonical counterpart.
 */
const STATUS: Record<string, TrackingEventStatus> = {
  ORDER_PROCESSING: 'PRE_TRANSIT',
  PERSONALISATION_IN_PROGRESS: 'PRE_TRANSIT',
  PREPARING_FOR_DESPATCH: 'PRE_TRANSIT',
  PROCESSING: 'PRE_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  READY_TO_COLLECT: 'AVAILABLE_FOR_PICKUP',
  NOT_DELIVERED: 'FAILURE',
  NOT_COLLECTED: 'FAILURE',
  RETURN_TO_SENDER: 'RETURN_TO_SENDER',
}

export function mapTrackingStatus(statusCode: string | undefined): TrackingEventStatus {
  return (statusCode && STATUS[statusCode]) || 'UNKNOWN'
}

function toAddress(a: MetapackAddress | undefined): Address | undefined {
  if (!a) return undefined
  return {
    company: a.companyName,
    street1: a.addressLine1,
    street2: a.addressLine2,
    city: a.city,
    state: a.stateProvince,
    postalCode: a.postCode,
  }
}

/** Deterministic id from documented fields; none when a part is missing. */
function eventId(e: MetapackTrackingEvent): string | undefined {
  if (!e.trackingIdentifier || !e.eventDate || !e.eventCode) return undefined
  return `${e.trackingIdentifier}:${e.eventDate}:${e.eventCode}`
}

export function transformTrackingEvent(
  e: MetapackTrackingEvent,
  legs: readonly MetapackDeliveryLeg[] = [],
): TrackingEvent {
  const leg = legs.find(
    (l) => l.trackingIdentifier !== undefined && l.trackingIdentifier === e.trackingIdentifier,
  )
  return {
    id: eventId(e),
    trackingNumber: e.trackingIdentifier,
    carrierId: leg?.carrierCode,
    status: mapTrackingStatus(e.statusCode),
    description: e.eventDescription,
    location: toAddress(e.eventLocation?.address),
    occurredAt: toISODate(e.eventDate),
    metadata: { ...e },
  }
}

/** Every tracking event of every journey returned, in the order Metapack sent them. */
export function transformParcelJourneys(
  journeys: readonly MetapackParcelJourney[],
): TrackingEvent[] {
  return journeys.flatMap((j) =>
    (j.trackingEvents ?? []).map((e) => transformTrackingEvent(e, j.parcel?.deliveryLegs ?? [])),
  )
}
