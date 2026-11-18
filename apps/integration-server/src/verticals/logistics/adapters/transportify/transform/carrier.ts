import type { Carrier } from '../../../schema/carrier'

/**
 * A Transportify vehicle type, as returned by GET /public_api/v10/vehicle_types.
 * Vehicle types are the closest concept to "carrier services" in the Transportify API.
 *
 * Reference: https://developers.deliveree.com/
 */
export interface TransportifyVehicleType {
  id: number | null
  name: string | null
  cargo_length: number | null
  cargo_height: number | null
  cargo_width: number | null
  cargo_weight: number | null
  cargo_cubic_meter: number | null
  minimum_pickup_time_now: string | null
  minimum_pickup_time_schedule: string | null
  minimum_pickup_time_fullday: string | null
  minimum_pickup_time_fpr: string | null
  [key: string]: unknown
}

export function transformCarrier(raw: TransportifyVehicleType): Carrier {
  const id = raw.id != null ? String(raw.id) : undefined

  return {
    id,
    name: raw.name ?? undefined,
    code: id,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
