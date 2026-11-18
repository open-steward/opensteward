import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

/**
 * Raw package record returned by the Quadient Parcel Pending API.
 * A "package" in Parcel Pending represents a parcel delivered into a locker
 * compartment and maps naturally onto the TrackingEvent model.
 */
export interface QuadientPackage {
  packageId: string
  trackingNumber: string | null
  carrier: string | null
  status: string
  lockerName: string | null
  lockerAddress: string | null
  lockerCity: string | null
  lockerState: string | null
  lockerPostalCode: string | null
  lockerCountry: string | null
  recipientEmail: string | null
  deliveredAt: string | null
  pickedUpAt: string | null
  returnedAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  [key: string]: unknown
}

/**
 * Parcel Pending package statuses → canonical TrackingEventStatus.
 *
 * Parcel Pending statuses (from docs):
 *   pending        — booked/expected but not yet delivered
 *   delivered      — placed into a locker compartment
 *   picked_up      — recipient retrieved from locker
 *   expired        — locker hold period lapsed
 *   returned       — carrier collected unclaimed package
 *   failed         — delivery attempt failed
 */
function mapStatus(status: string): TrackingEventStatus {
  switch (status.toLowerCase()) {
    case 'pending':
      return 'PRE_TRANSIT'
    case 'delivered':
      return 'AVAILABLE_FOR_PICKUP'
    case 'picked_up':
      return 'DELIVERED'
    case 'expired':
    case 'returned':
      return 'RETURN_TO_SENDER'
    case 'failed':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

/**
 * Build a human-readable description from a Parcel Pending package status
 * and locker metadata.
 */
function buildDescription(pkg: QuadientPackage): string | undefined {
  switch (pkg.status.toLowerCase()) {
    case 'pending':
      return 'Package expected at parcel locker'
    case 'delivered':
      return pkg.lockerName
        ? `Delivered to locker: ${pkg.lockerName}`
        : 'Delivered to parcel locker'
    case 'picked_up':
      return 'Package picked up by recipient'
    case 'expired':
      return 'Package hold period expired'
    case 'returned':
      return 'Package returned to carrier'
    case 'failed':
      return 'Delivery to locker failed'
    default:
      return undefined
  }
}

export function transformPackage(pkg: QuadientPackage): TrackingEvent {
  const lockerAddress =
    pkg.lockerCity || pkg.lockerState || pkg.lockerCountry || pkg.lockerPostalCode
      ? {
          city: pkg.lockerCity ?? undefined,
          state: pkg.lockerState ?? undefined,
          country: pkg.lockerCountry ?? undefined,
          postalCode: pkg.lockerPostalCode ?? undefined,
        }
      : undefined

  // Use the most-relevant timestamp as the event time.
  const occurredAt =
    toISODate(pkg.pickedUpAt ?? pkg.deliveredAt ?? pkg.returnedAt ?? pkg.updatedAt)

  return {
    trackingNumber: pkg.trackingNumber ?? pkg.packageId,
    carrierId: pkg.carrier ?? undefined,
    status: mapStatus(pkg.status),
    description: buildDescription(pkg),
    location: lockerAddress,
    occurredAt,
    createdAt: toISODate(pkg.createdAt),
    metadata: pkg as Record<string, unknown>,
  }
}
