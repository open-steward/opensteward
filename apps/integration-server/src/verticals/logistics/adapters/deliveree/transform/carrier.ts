import type { Carrier } from '../../../schema/carrier'

export interface DelivereeVehicleType {
  id?: number | null
  name?: string | null
  cargo_length?: number | null
  cargo_height?: number | null
  cargo_width?: number | null
  cargo_weight?: number | null
  cargo_cubic_meter?: number | null
  minimum_pickup_time_now?: string | null
  minimum_pickup_time_schedule?: string | null
  [key: string]: unknown
}

export function transformVehicleType(raw: DelivereeVehicleType): Carrier {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.name ?? undefined,
    code: raw.id != null ? String(raw.id) : undefined,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
