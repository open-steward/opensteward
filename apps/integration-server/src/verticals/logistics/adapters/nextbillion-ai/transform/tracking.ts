/**
 * Transform NextBillion.ai Skynet asset location data → canonical TrackingEvent.
 *
 * The Live Tracking API returns an array of location records from:
 *   GET /skynet/asset/{id}/location/list
 */
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

/** A single location record from the Skynet asset history endpoint. */
export interface NBAssetLocation {
  id?: string | null
  asset_id?: string | null
  lat?: number | null
  lng?: number | null
  timestamp?: string | null
  speed?: number | null
  bearing?: number | null
  altitude?: number | null
  accuracy?: number | null
  metadata?: Record<string, unknown> | null
  [key: string]: unknown
}

/** Skynet asset event record from GET /skynet/asset/{id}/event/list */
export interface NBAssetEvent {
  id?: string | null
  asset_id?: string | null
  monitor_id?: string | null
  type?: string | null   // e.g. 'geofence_enter', 'geofence_exit', 'speeding'
  data?: Record<string, unknown> | null
  timestamp?: string | null
  [key: string]: unknown
}

/** A Skynet asset summary. */
export interface NBAsset {
  id?: string | null
  name?: string | null
  description?: string | null
  attributes?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapEventType(type: string | null | undefined): TrackingEventStatus {
  switch ((type ?? '').toLowerCase()) {
    case 'geofence_enter':
    case 'arrival':        return 'IN_TRANSIT'
    case 'geofence_exit':
    case 'departure':      return 'IN_TRANSIT'
    case 'delivered':      return 'DELIVERED'
    case 'pickup':         return 'IN_TRANSIT'
    case 'failure':        return 'FAILURE'
    default:               return 'UNKNOWN'
  }
}

export function transformAssetLocation(raw: NBAssetLocation, assetId?: string): TrackingEvent {
  const lat = raw.lat ?? undefined
  const lng = raw.lng ?? undefined

  return {
    id: raw.id ?? undefined,
    shipmentId: raw.asset_id ?? assetId ?? undefined,
    trackingNumber: raw.asset_id ?? assetId ?? undefined,
    status: 'IN_TRANSIT',
    // Coordinates are stored in metadata; description surfaces them for human consumers.
    description: lat !== undefined && lng !== undefined
      ? `Location update: ${lat}, ${lng}`
      : undefined,
    occurredAt: toISODate(raw.timestamp),
    createdAt: toISODate(raw.timestamp),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformAssetEvent(raw: NBAssetEvent, assetId?: string): TrackingEvent {
  return {
    id: raw.id ?? undefined,
    shipmentId: raw.asset_id ?? assetId ?? undefined,
    trackingNumber: raw.asset_id ?? assetId ?? undefined,
    status: mapEventType(raw.type),
    description: raw.type ?? undefined,
    occurredAt: toISODate(raw.timestamp),
    createdAt: toISODate(raw.timestamp),
    metadata: raw as Record<string, unknown>,
  }
}
