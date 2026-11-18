import type { TrackingEvent } from '../../../schema/trackingevent'

/**
 * The response `data` of "Order Track Query (Single)", POST /client/track/getOne
 * (https://developer.imile.com/apis/details/1826891449751908354). Field notes
 * quote that document.
 */
export interface IMileTrackLocus {
  /** "Track status: The track includes system scanning status, receipt status, problem item status, international logistics tracking and other information" */
  latestStatus?: string | null
  /** "status generation time" (top level: "time format yyyy-MM-DD hh:mm:ss") */
  latestStatusTime?: string | null
  /** "Parcel location station" */
  latestSite?: string | null
  /** "Track details" */
  locusDetailed?: string | null
  /** "Track type: scan:Scan status, delivery:delivery status, problem:Problem status, international: International logistics tracking, warehouse: WMS inventory operation track, cancelOrder:Cancel order" */
  locusType?: string | null
  /** e.g. "GMT+08:00" */
  timeZone?: string | null
  pods?: string[] | null
  longitude?: string | null
  latitude?: string | null
}

export interface IMileTrackOne {
  /** "iMile waybill number" */
  billNo?: string | null
  /** "order type" */
  orderType?: string | null
  /** "Customer order number/Reference number" */
  orderNo?: string | null
  /** "Old Reference number" */
  oldOrderNo?: string | null
  latestStatus?: string | null
  latestStatusTime?: string | null
  latestSite?: string | null
  locusType?: string | null
  /** The track, one entry per event. */
  locus?: IMileTrackLocus[] | null
  /** "Latest track details" */
  latestLocus?: string | null
  timeZone?: string | null
}

const LOCAL_TIME = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/
const GMT_OFFSET = /^GMT([+-]\d{2}:\d{2})$/

/**
 * "yyyy-MM-DD hh:mm:ss" read in the entry's own "GMT+08:00" zone. Either
 * part missing or in another form leaves the time unset rather than guessing
 * a zone.
 */
function toInstant(
  time: string | null | undefined,
  zone: string | null | undefined,
): Date | undefined {
  const t = LOCAL_TIME.exec(time ?? '')
  const z = GMT_OFFSET.exec(zone ?? '')
  if (!t || !z) return undefined
  const d = new Date(`${t[1]}T${t[2]}${z[1]}`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/**
 * One canonical event per `locus` entry.
 *
 * status is UNKNOWN: the document defers latestStatus to "Data Dictionary -
 * Track Status", which iMile's public catalog does not publish, so there is
 * no documented meaning to map. iMile's own latestStatus and locusType ride
 * in metadata.
 */
export function transformTracking(raw: IMileTrackOne): TrackingEvent[] {
  const waybill = raw.billNo ?? undefined
  return (raw.locus ?? []).map((l) => ({
    shipmentId: waybill,
    trackingNumber: waybill,
    carrierId: 'imile',
    status: 'UNKNOWN',
    description: l.locusDetailed ?? undefined,
    occurredAt: toInstant(l.latestStatusTime, l.timeZone),
    metadata: {
      latestStatus: l.latestStatus ?? null,
      latestStatusTime: l.latestStatusTime ?? null,
      locusType: l.locusType ?? null,
      latestSite: l.latestSite ?? null,
      timeZone: l.timeZone ?? null,
      pods: l.pods ?? null,
      longitude: l.longitude ?? null,
      latitude: l.latitude ?? null,
      orderNo: raw.orderNo ?? null,
      orderType: raw.orderType ?? null,
    },
  }))
}
