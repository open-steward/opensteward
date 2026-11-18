import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, toDimensions } from '../../shared/transform'
import { transformAddress, type Locate2uContact } from './address'

export interface Locate2uLoad {
  quantity?: number | null
  volume?: number | null
  weight?: number | null
  length?: number | null
  width?: number | null
  height?: number | null
}

export interface Locate2uStop {
  stopId?: number | null
  status?: string | null
  contact?: Locate2uContact | null
  name?: string | null
  address?: string | null
  location?: { latitude?: number | null; longitude?: number | null } | null
  tripDate?: string | null
  appointmentTime?: string | null
  durationMinutes?: number | null
  notes?: string | null
  load?: Locate2uLoad | null
  lines?: unknown[]
  [key: string]: unknown
}

export interface Locate2uShipment {
  shipmentId?: number | null
  brandId?: number | null
  status?: string | null
  shipmentRef?: string | null
  contact?: Locate2uContact | null
  tripDate?: string | null
  skills?: string | null
  customFields?: Record<string, unknown> | null
  lastModifiedDate?: string | null
  notes?: string | null
  source?: string | null
  sourceReference?: string | null
  load?: Locate2uLoad | null
  customerId?: number | null
  runNumber?: number | null
  teamRegionId?: number | null
  pickupStopId?: number | null
  pickupStop?: Locate2uStop | null
  dropStopId?: number | null
  dropStop?: Locate2uStop | null
  contents?: unknown
  chargeLines?: unknown
  costLines?: unknown
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':
    case 'unassigned':
      return 'PENDING'
    case 'assigned':
    case 'accepted':
      return 'LABEL_CREATED'
    case 'inprogress':
    case 'in_progress':
    case 'intransit':
    case 'in_transit':
      return 'IN_TRANSIT'
    case 'completed':
    case 'delivered':
      return 'DELIVERED'
    case 'cancelled':
    case 'rejected':
    case 'discarded':
      return 'CANCELLED'
    case 'failed':
    case 'exception':
      return 'EXCEPTION'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: Locate2uShipment): Shipment {
  const load = raw.load ?? null
  const pickupStop = raw.pickupStop ?? null
  const dropStop = raw.dropStop ?? null

  const originAddress = pickupStop
    ? transformAddress(pickupStop.address, pickupStop.contact ?? raw.contact)
    : undefined

  const destinationAddress = dropStop
    ? transformAddress(dropStop.address, dropStop.contact ?? raw.contact)
    : undefined

  // Prefer stop-level load for dimensions/weight, fall back to shipment-level
  const effectiveLoad = pickupStop?.load ?? load

  return {
    id: raw.shipmentId != null ? String(raw.shipmentId) : undefined,
    status: mapShipmentStatus(raw.status),
    reference: raw.shipmentRef ?? undefined,
    notes: raw.notes ?? undefined,
    originAddress,
    destinationAddress,
    totalWeight:
      effectiveLoad?.weight != null
        ? toWeight(effectiveLoad.weight, 'kg')
        : undefined,
    dimensions:
      effectiveLoad?.length != null &&
      effectiveLoad?.width != null &&
      effectiveLoad?.height != null
        ? toDimensions(effectiveLoad.length, effectiveLoad.width, effectiveLoad.height, 'cm')
        : undefined,
    createdAt: toISODate(raw.tripDate),
    updatedAt: toISODate(raw.lastModifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}
