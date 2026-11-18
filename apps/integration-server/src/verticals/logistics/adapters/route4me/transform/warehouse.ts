import type { Warehouse } from '../../../schema/warehouse'
import { toAddress, toISODate } from '../../shared/transform'

/**
 * A Route4Me depot address record (from the
 * GET /address-book/addresses/depots endpoint on wh.route4me.com/modules/api/v5.0/).
 * Depots are the starting/ending locations for routes; they serve as warehouses
 * in the canonical logistics model.
 */
export interface Route4MeDepot {
  address_id?: number | null
  address_alias?: string | null
  address_1?: string | null
  address_2?: string | null
  address_city?: string | null
  address_state_id?: string | null
  address_country_id?: string | null
  address_zip?: string | null
  address_email?: string | null
  address_phone_number?: string | null
  first_name?: string | null
  last_name?: string | null
  cached_lat?: number | null
  cached_lng?: number | null
  local_timezone_string?: string | null
  local_time_window_start?: number | null
  local_time_window_end?: number | null
  created_timestamp?: number | null
  [key: string]: unknown
}

function formatCutoff(seconds: number | null | undefined): string | undefined {
  if (seconds == null) return undefined
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function transformWarehouse(raw: Route4MeDepot): Warehouse {
  const fullName = [raw.first_name, raw.last_name].filter(Boolean).join(' ') || undefined
  const name: string | undefined = raw.address_alias ?? fullName ?? undefined

  return {
    id: raw.address_id != null ? String(raw.address_id) : undefined,
    name,
    address: toAddress({
      name,
      address1: raw.address_1,
      address2: raw.address_2,
      city: raw.address_city,
      state: raw.address_state_id,
      country_code: raw.address_country_id,
      zip: raw.address_zip,
      phone: raw.address_phone_number,
      email: raw.address_email,
    }),
    isActive: true,
    timezone: raw.local_timezone_string ?? undefined,
    cutoffTime: formatCutoff(raw.local_time_window_end),
    createdAt: toISODate(
      raw.created_timestamp != null ? raw.created_timestamp * 1000 : undefined,
    ),
    metadata: raw as Record<string, unknown>,
  }
}
