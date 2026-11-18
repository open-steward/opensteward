import { toIsoDatetime } from '@opensteward/shared'
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toAddress } from '../../shared/transform'
import { ELOGII_PLATFORM } from '../constants'
import type { ElogiiTask } from './shipment'

// eLogii task history entry
export interface ElogiiTaskHistoryEntry {
  state?: number | null
  createdAt?: string | null
  location?: {
    address?: {
      street?: string | null
      city?: string | null
      state?: string | null
      country?: string | null
      postcode?: string | null
    } | null
    latitude?: number | null
    longitude?: number | null
  } | null
  description?: string | null
  [key: string]: unknown
}

function mapTaskStateToTrackingStatus(state: number | null | undefined): TrackingEventStatus {
  switch (state) {
    case 0: return 'PRE_TRANSIT'
    case 1: return 'PRE_TRANSIT'
    case 2: return 'IN_TRANSIT'
    case 3: return 'DELIVERED'
    case 4: return 'FAILURE'
    case 5: return 'RETURN_TO_SENDER'
    default: return 'UNKNOWN'
  }
}

export function transformTracking(raw: ElogiiTask): TrackingEvent[] {
  const occurredAt =
    raw.completedAt
      ? (toIsoDatetime(raw.completedAt) ? new Date(toIsoDatetime(raw.completedAt)!) : undefined)
      : raw.updatedAt
        ? (toIsoDatetime(raw.updatedAt) ? new Date(toIsoDatetime(raw.updatedAt)!) : undefined)
        : raw.createdAt
          ? (toIsoDatetime(raw.createdAt) ? new Date(toIsoDatetime(raw.createdAt)!) : undefined)
          : undefined

  const loc = raw.location
  const location = loc?.address
    ? toAddress({
        street1: loc.address.street ?? null,
        city: loc.address.city ?? null,
        state: loc.address.state ?? null,
        country: loc.address.country ?? null,
        postalCode: loc.address.postcode ?? null,
      })
    : undefined

  return [
    {
      shipmentId: raw._id,
      trackingNumber: raw.trackingCode ?? raw.externalId ?? raw._id,
      carrierId: ELOGII_PLATFORM,
      status: mapTaskStateToTrackingStatus(raw.state ?? undefined),
      location,
      occurredAt,
      createdAt: raw.createdAt ? (toIsoDatetime(raw.createdAt) ? new Date(toIsoDatetime(raw.createdAt)!) : undefined) : undefined,
      metadata: raw as Record<string, unknown>,
    },
  ]
}

export function transformTrackingHistory(
  taskId: string,
  trackingCode: string | null | undefined,
  entries: ElogiiTaskHistoryEntry[],
): TrackingEvent[] {
  return entries.map((entry) => {
    const loc = entry.location
    const location = loc?.address
      ? toAddress({
          street1: loc.address.street ?? null,
          city: loc.address.city ?? null,
          state: loc.address.state ?? null,
          country: loc.address.country ?? null,
          postalCode: loc.address.postcode ?? null,
        })
      : undefined

    return {
      shipmentId: taskId,
      trackingNumber: trackingCode ?? taskId,
      carrierId: ELOGII_PLATFORM,
      status: mapTaskStateToTrackingStatus(entry.state ?? undefined),
      description: entry.description ?? undefined,
      location,
      occurredAt: entry.createdAt ? (toIsoDatetime(entry.createdAt) ? new Date(toIsoDatetime(entry.createdAt)!) : undefined) : undefined,
      metadata: entry as Record<string, unknown>,
    }
  })
}
