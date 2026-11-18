import type { Warehouse } from '../../../schema/warehouse'

/**
 * Raw CDEK delivery point location object as returned by GET /deliverypoints.
 */
export interface CdekDeliveryPointLocation {
  country_code?: string | null
  region_code?: number | null
  region?: string | null
  city_code?: number | null
  city?: string | null
  fias_guid?: string | null
  postal_code?: string | null
  longitude?: number | null
  latitude?: number | null
  address?: string | null
  address_full?: string | null
  [key: string]: unknown
}

/**
 * Raw CDEK delivery point work time entry.
 */
export interface CdekDeliveryPointWorkTime {
  day?: number | null
  time?: string | null
  [key: string]: unknown
}

/**
 * Raw CDEK delivery point as returned by GET /deliverypoints.
 *
 * Endpoint: GET https://api.cdek.ru/v2/deliverypoints
 * Docs:     https://api-docs.cdek.ru/36990336.html
 *
 * CDEK "delivery points" (ПВЗ / постаматы) are the physical offices and parcel
 * lockers in CDEK's own pickup-point network. They are the closest concept to
 * a "warehouse" in this platform's model.
 */
export interface CdekDeliveryPoint {
  code?: string | null
  name?: string | null
  address_comment?: string | null
  work_time?: string | null
  phones?: Array<{ number?: string | null }> | null
  email?: string | null
  note?: string | null
  type?: string | null
  owner_code?: string | null
  take_only?: boolean | null
  is_handout?: boolean | null
  is_reception?: boolean | null
  is_dressing_room?: boolean | null
  have_cashless?: boolean | null
  have_cash?: boolean | null
  allowed_cod?: boolean | null
  site?: string | null
  work_time_list?: CdekDeliveryPointWorkTime[] | null
  weight_min?: number | null
  weight_max?: number | null
  location?: CdekDeliveryPointLocation | null
  fulfillment?: boolean | null
  nearest_station?: string | null
  nearest_metro_station?: string | null
  [key: string]: unknown
}

/**
 * Extract a representative cut-off time (HH:MM) from the work_time_list.
 * CDEK encodes each weekday entry as { day: 1, time: "09:00/20:00" }.
 * We take the closing time of the first entry as a proxy cut-off.
 */
function extractCutoffTime(
  workTimeList: CdekDeliveryPointWorkTime[] | null | undefined,
): `${string}:${string}` | undefined {
  const first = workTimeList?.[0]
  if (!first?.time) return undefined
  // Format is "HH:MM/HH:MM"; take the closing side.
  const parts = first.time.split('/')
  const closing = parts[1]?.trim()
  if (!closing || !/^\d{2}:\d{2}$/.test(closing)) return undefined
  return closing as `${string}:${string}`
}

export function transformDeliveryPoint(raw: CdekDeliveryPoint): Warehouse {
  const loc = raw.location

  return {
    id: raw.code ?? undefined,
    name: raw.name ?? undefined,
    code: raw.code ?? undefined,
    address: loc
      ? {
          street1: loc.address ?? loc.address_full ?? undefined,
          city: loc.city ?? undefined,
          state: loc.region ?? undefined,
          postalCode: loc.postal_code ?? undefined,
          country: loc.country_code ?? undefined,
          phone: raw.phones?.[0]?.number ?? undefined,
          email: raw.email ?? undefined,
        }
      : undefined,
    isActive: true,
    cutoffTime: extractCutoffTime(raw.work_time_list),
    metadata: raw as Record<string, unknown>,
  }
}
