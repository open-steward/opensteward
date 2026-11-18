import type { Warehouse } from '../../../schema/warehouse'
import type { Address } from '../../../schema/shared'

/**
 * Venipak pickup point / terminal as returned by ws/get_pickup_points.
 *
 * The endpoint returns a JSON array of locker and terminal locations.
 * Field names are derived from the confirmed live response shape.
 */
export interface VenipakPickupPoint {
  id?: string | number | null
  name?: string | null
  code?: string | null
  display_name?: string | null
  address?: string | null
  city?: string | null
  zip?: string | null
  country?: string | null
  contact_t?: string | null
  working_hours?: unknown
  pick_up_enabled?: boolean | null
  type?: string | number | null
  [key: string]: unknown
}

function toPickupAddress(raw: VenipakPickupPoint): Address | undefined {
  const hasAny = raw.address || raw.city || raw.zip || raw.country
  if (!hasAny) return undefined
  return {
    street1: raw.address ?? undefined,
    city: raw.city ?? undefined,
    postalCode: raw.zip ?? undefined,
    country: raw.country ?? undefined,
    phone: raw.contact_t ?? undefined,
  }
}

export function transformWarehouse(raw: VenipakPickupPoint): Warehouse {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.display_name ?? raw.name ?? undefined,
    code: raw.code ?? (raw.id != null ? String(raw.id) : undefined),
    address: toPickupAddress(raw),
    isActive: raw.pick_up_enabled !== false,
    metadata: raw as Record<string, unknown>,
  }
}
