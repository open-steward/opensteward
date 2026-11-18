import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Purolator raw types ────────────────────────────────────────────────────

export interface PurolatorScan {
  ScanType: string | null
  Description: string | null
  ScanDate: string | null
  ScanTime: string | null
  Depot: {
    Name: string | null
    City: string | null
    Province: string | null
    Country: string | null
    PostalCode: string | null
  } | null
  [key: string]: unknown
}

export interface PurolatorTrackingResponse {
  PIN: string
  Status?: string | null
  TrackingInformation?: {
    Scans?: { Scan: PurolatorScan[] } | null
  } | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(scanType: string | null, description: string | null): TrackingEventStatus {
  switch (scanType) {
    case 'Pickup':
    case 'Origin':              return 'PRE_TRANSIT'
    case 'Transit':
    case 'InTransit':           return 'IN_TRANSIT'
    case 'OnVehicle':
    case 'OutForDelivery':      return 'OUT_FOR_DELIVERY'
    case 'Delivery':
    case 'Delivered':           return 'DELIVERED'
    case 'HeldForPickup':       return 'AVAILABLE_FOR_PICKUP'
    case 'Return':
    case 'Returned':            return 'RETURN_TO_SENDER'
    case 'Exception':
    case 'Undeliverable':       return 'FAILURE'
    default: break
  }

  const lower = (description ?? '').toLowerCase()
  if (lower.includes('delivered')) return 'DELIVERED'
  if (lower.includes('out for delivery')) return 'OUT_FOR_DELIVERY'
  if (lower.includes('in transit')) return 'IN_TRANSIT'
  if (lower.includes('picked up')) return 'PRE_TRANSIT'
  if (lower.includes('held for pickup')) return 'AVAILABLE_FOR_PICKUP'
  if (lower.includes('return')) return 'RETURN_TO_SENDER'
  if (lower.includes('exception') || lower.includes('undeliverable')) return 'FAILURE'
  return 'UNKNOWN'
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: PurolatorTrackingResponse): TrackingEvent[] {
  const scans = raw.TrackingInformation?.Scans?.Scan ?? []
  const pin = raw.PIN

  if (scans.length === 0) {
    return [
      {
        trackingNumber: pin ?? undefined,
        carrierId: 'purolator',
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return scans.map((scan) => {
    const iso =
      scan.ScanDate && scan.ScanTime
        ? `${scan.ScanDate}T${scan.ScanTime}`
        : scan.ScanDate ?? undefined
    return {
      trackingNumber: pin ?? undefined,
      carrierId: 'purolator',
      status: mapTrackingStatus(scan.ScanType, scan.Description),
      description: scan.Description ?? undefined,
      location: scan.Depot
        ? {
            city: scan.Depot.City ?? scan.Depot.Name ?? undefined,
            state: scan.Depot.Province ?? undefined,
            country: scan.Depot.Country ?? undefined,
            postalCode: scan.Depot.PostalCode ?? undefined,
          }
        : undefined,
      occurredAt: toISODate(iso),
      metadata: scan as Record<string, unknown>,
    }
  })
}
