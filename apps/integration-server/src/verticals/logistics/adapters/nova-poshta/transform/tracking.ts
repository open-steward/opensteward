import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { NOVA_POSHTA_CARRIER_ID } from '../constants'

/**
 * A single entry from the `currentStatus` array returned by
 * GET /shipments/tracking?numbers[]=<number>.
 */
export interface NovaPoshtaCurrentStatus {
  number?: string | null
  statusCode?: number | string | null
  status?: string | null
  statusDate?: string | null
  createdDate?: string | null
  scheduledDate?: string | null
  closingDate?: string | null
  deliveryType?: string | null
  deliveryCountry?: string | null
  [key: string]: unknown
}

/**
 * A single entry from the `detailsTracking` / `historyOnlineTracking` arrays
 * returned by GET /shipments/tracking?numbers[]=<number>.
 */
export interface NovaPoshtaTrackingEntry {
  number?: string | null
  date?: string | null
  event?: string | null
  eventStatus?: string | null
  eventName?: string | null
  countryCode?: string | null
  code?: string | null
  divisionName?: string | null
  postCode?: string | null
  settlementName?: string | null
  // Legacy / fallback field names kept for defensive mapping.
  status?: string | null
  statusCode?: number | string | null
  description?: string | null
  datetime?: string | null
  city?: string | null
  settlement?: string | null
  region?: string | null
  warehouseName?: string | null
  [key: string]: unknown
}

/**
 * Top-level response from GET /shipments/tracking?numbers[]=<number>.
 * Nova Poshta returns arrays for each section of the tracking response.
 */
export interface NovaPoshtaTrackingResponse {
  currentStatus?: NovaPoshtaCurrentStatus[]
  detailsTracking?: NovaPoshtaTrackingEntry[]
  historyOnlineTracking?: NovaPoshtaTrackingEntry[]
  // Legacy / fallback field names kept for defensive mapping.
  id?: string | null
  number?: string | null
  status?: string | null
  trackingHistory?: NovaPoshtaTrackingEntry[]
  statusHistory?: NovaPoshtaTrackingEntry[]
  history?: NovaPoshtaTrackingEntry[]
  createdAt?: string | null
  [key: string]: unknown
}

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  if (!status) return 'UNKNOWN'
  switch (status.toLowerCase()) {
    case 'pretransit':
    case 'pre_transit':
    case 'created':
    case 'accepted':
    case 'registered':
      return 'PRE_TRANSIT'
    case 'intransit':
    case 'in_transit':
    case 'transit':
    case 'processing':
    case 'sortingcenter':
      return 'IN_TRANSIT'
    case 'outfordelivery':
    case 'out_for_delivery':
    case 'delivering':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
    case 'received':
      return 'DELIVERED'
    case 'availableforpickup':
    case 'available_for_pickup':
    case 'awaitingpickup':
    case 'storagewaiting':
      return 'AVAILABLE_FOR_PICKUP'
    case 'returntosender':
    case 'return_to_sender':
    case 'returned':
      return 'RETURN_TO_SENDER'
    case 'failure':
    case 'lost':
    case 'damaged':
    case 'error':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

function toEntryLocation(entry: NovaPoshtaTrackingEntry): Address | undefined {
  const city = entry.settlementName ?? entry.city ?? entry.settlement
  const state = entry.region
  const country = entry.countryCode
  if (!city && !state && !country) return undefined
  return {
    city: city ?? undefined,
    state: state ?? undefined,
    country: country ?? undefined,
  }
}

export function transformTrackingResponse(raw: NovaPoshtaTrackingResponse): TrackingEvent[] {
  // Real API response: currentStatus[] describes the top-level status per parcel;
  // detailsTracking[] / historyOnlineTracking[] contain the movement history.
  const currentStatusArr = raw.currentStatus ?? []
  const historyArr: NovaPoshtaTrackingEntry[] =
    raw.detailsTracking ??
    raw.historyOnlineTracking ??
    raw.trackingHistory ??
    raw.statusHistory ??
    raw.history ??
    []

  // Derive the tracking number from the first currentStatus entry or fallback field.
  const trackingNumber =
    currentStatusArr[0]?.number ?? (raw.number ?? undefined)

  if (historyArr.length > 0) {
    return historyArr.map((entry) => ({
      shipmentId: raw.id ?? undefined,
      trackingNumber: entry.number ?? trackingNumber,
      carrierId: NOVA_POSHTA_CARRIER_ID,
      status: mapTrackingStatus(entry.eventStatus ?? entry.event ?? entry.status),
      description: entry.eventName ?? entry.description ?? undefined,
      location: toEntryLocation(entry),
      occurredAt: toISODate(entry.date ?? entry.datetime),
      createdAt: toISODate(currentStatusArr[0]?.createdDate ?? raw.createdAt),
      metadata: raw as Record<string, unknown>,
    }))
  }

  // Fallback: synthesise a single event from the first currentStatus entry.
  const current = currentStatusArr[0]
  return [
    {
      shipmentId: raw.id ?? undefined,
      trackingNumber,
      carrierId: NOVA_POSHTA_CARRIER_ID,
      status: mapTrackingStatus(current?.status ?? raw.status),
      createdAt: toISODate(current?.createdDate ?? raw.createdAt),
      metadata: raw as Record<string, unknown>,
    },
  ]
}
