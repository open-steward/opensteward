/**
 * Transform NextBillion.ai Dispatch Route → canonical Shipment.
 *
 * NextBillion.ai's "route" concept (via the Fleetify Dispatch API) maps most
 * naturally to a Shipment: a driver-assigned route from an origin to one or
 * more delivery stops.
 */
import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

/** Completion state of a dispatched route step. */
export interface NBRouteStepCompletion {
  status?: string | null
  note?: string | null
  timestamp?: string | null
}

/** A stop in a dispatched NextBillion.ai route. */
export interface NBRouteStep {
  id?: string | null
  short_id?: string | null
  type?: string | null // 'start' | 'job' | 'end'
  arrival?: string | null
  address?: string | null
  location?: { lat?: number | null; lng?: number | null } | null
  completion?: NBRouteStepCompletion | null
  [key: string]: unknown
}

/** Driver object embedded in a dispatched route. */
export interface NBDriver {
  id?: string | null
  fullname?: string | null
  email?: string | null
  [key: string]: unknown
}

/**
 * A dispatched route as returned by:
 *   POST /fleetify/routes
 *   GET  /fleetify/routes/{id}
 */
export interface NBRoute {
  id?: string | null
  short_id?: string | null
  status?: string | null
  distance?: number | null        // metres
  routing?: string | null         // 'car' | 'truck' | etc.
  steps?: NBRouteStep[] | null
  driver?: NBDriver | null
  total_steps?: number | null
  completed_steps?: number | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapRouteStatus(status: string | null | undefined): ShipmentStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'completed':   return 'DELIVERED'
    case 'in_progress': return 'IN_TRANSIT'
    case 'dispatched':  return 'LABEL_CREATED'
    case 'cancelled':   return 'CANCELLED'
    case 'failed':      return 'EXCEPTION'
    default:            return 'UNKNOWN'
  }
}

export function transformRoute(raw: NBRoute): Shipment {
  const steps = raw.steps ?? []

  // Use the first non-start step address as destination, start step as origin.
  const startStep = steps.find((s) => s.type === 'start') ?? steps[0]
  const destStep = steps.find((s) => s.type === 'job' || s.type === 'end') ?? steps[steps.length - 1]

  return {
    id: raw.id ?? undefined,
    status: mapRouteStatus(raw.status),
    carrierId: raw.driver?.id ?? undefined,
    serviceCode: raw.routing ?? undefined,
    originAddress: startStep?.address
      ? { street1: startStep.address }
      : undefined,
    destinationAddress: destStep?.address
      ? { street1: destStep.address }
      : undefined,
    estimatedDeliveryAt: destStep?.arrival ? toISODate(destStep.arrival) : undefined,
    actualDeliveryAt:
      raw.status?.toLowerCase() === 'completed' && destStep?.completion?.timestamp
        ? toISODate(destStep.completion.timestamp)
        : undefined,
    reference: raw.short_id ?? undefined,
    notes: undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
