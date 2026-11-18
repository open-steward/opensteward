import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'

/**
 * A Route4Me optimization_problem record.
 * An optimization holds a set of destination addresses and produces one or
 * more routes once solved; we surface it as a Shipment so integrations can
 * track the full optimization lifecycle.
 */
export interface Route4MeOptimization {
  optimization_problem_id: string
  state?: number | null
  /** ISO-8601 created timestamp */
  created_timestamp?: number | null
  /** ISO-8601 updated timestamp */
  updated_timestamp?: number | null
  /** User-supplied reference */
  parameters?: {
    route_name?: string | null
    callback_url?: string | null
    [key: string]: unknown
  } | null
  /** Destination addresses */
  addresses?: Route4MeAddress[] | null
  /** Solved routes */
  routes?: Route4MeRoute[] | null
  [key: string]: unknown
}

export interface Route4MeAddress {
  route_destination_id?: string | null
  address?: string | null
  alias?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  email?: string | null
  city?: string | null
  state?: string | null
  country_id?: string | null
  zip?: string | null
  lat?: number | null
  lng?: number | null
  is_depot?: boolean | null
  [key: string]: unknown
}

export interface Route4MeRoute {
  route_id?: string | null
  [key: string]: unknown
}

/**
 * Route4Me optimization states:
 *  1 = Initial
 *  2 = Matrix Processing
 *  3 = Optimization Processing
 *  4 = Optimized
 *  5 = Error
 *  6 = Computing directions
 */
function mapState(state: number | null | undefined): ShipmentStatus {
  switch (state) {
    case 1: return 'PENDING'
    case 2:
    case 3:
    case 6: return 'LABEL_CREATED'
    case 4: return 'IN_TRANSIT'
    case 5: return 'EXCEPTION'
    default: return 'UNKNOWN'
  }
}

export function transformShipment(raw: Route4MeOptimization): Shipment {
  const firstNonDepot = raw.addresses?.find((a) => !a.is_depot) ?? raw.addresses?.[0]
  const depot = raw.addresses?.find((a) => a.is_depot === true)

  return {
    id: raw.optimization_problem_id,
    status: mapState(raw.state),
    trackingNumber: raw.optimization_problem_id,
    carrierId: 'route4me',
    reference: raw.parameters?.route_name ?? undefined,
    originAddress: depot
      ? toAddress({
          address1: depot.address,
          name: [depot.first_name, depot.last_name].filter(Boolean).join(' ') || depot.alias,
          phone: depot.phone,
          city: depot.city,
          state: depot.state,
          country_code: depot.country_id,
          zip: depot.zip,
        })
      : undefined,
    destinationAddress: firstNonDepot
      ? toAddress({
          address1: firstNonDepot.address,
          name: [firstNonDepot.first_name, firstNonDepot.last_name].filter(Boolean).join(' ') || firstNonDepot.alias,
          phone: firstNonDepot.phone,
          email: firstNonDepot.email,
          city: firstNonDepot.city,
          state: firstNonDepot.state,
          country_code: firstNonDepot.country_id,
          zip: firstNonDepot.zip,
        })
      : undefined,
    createdAt: toISODate(raw.created_timestamp),
    updatedAt: toISODate(raw.updated_timestamp),
    metadata: raw as Record<string, unknown>,
  }
}
