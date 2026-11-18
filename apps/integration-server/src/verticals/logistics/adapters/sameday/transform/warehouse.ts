import type { Warehouse } from '../../../schema/warehouse'

/**
 * Raw pickup-point object from GET /api/client/pickup-points.
 *
 * Response shape (from SamedayGetPickupPointsResponse.php):
 * {
 *   data: [{
 *     id: number,
 *     country: { id, name, code },
 *     county:  { id, name, code },
 *     city:    { id, name, samedayDeliveryAgency, samedayPickupAgency, extraKM },
 *     address: string,
 *     defaultPickupPoint: boolean,
 *     pickupPointContactPerson: [{ id, name, phoneNumber, defaultContactPerson }],
 *     alias: string
 *   }],
 *   total, currentPage, pages
 * }
 */
export interface SamedayPickupPoint {
  id: number
  country: { id: number; name: string; code: string }
  county: { id: number; name: string; code: string }
  city: {
    id: number
    name: string
    samedayDeliveryAgency: string
    samedayPickupAgency: string
    extraKM: number
  }
  address: string
  defaultPickupPoint: boolean
  pickupPointContactPerson: Array<{
    id: number
    name: string
    phoneNumber: string
    defaultContactPerson: boolean
  }>
  alias: string
  [key: string]: unknown
}

export interface SamedayPickupPointsPage {
  data: SamedayPickupPoint[]
  total: number
  currentPage: number
  pages: number
  [key: string]: unknown
}

/**
 * Transform a Sameday pickup point into a canonical Warehouse.
 * Pickup points in Sameday represent the sender's collection addresses.
 */
export function transformPickupPoint(raw: SamedayPickupPoint): Warehouse {
  return {
    id: String(raw.id),
    name: raw.alias ?? raw.city?.name ?? undefined,
    code: String(raw.id),
    address: {
      street1: raw.address ?? undefined,
      city: raw.city?.name ?? undefined,
      state: raw.county?.name ?? undefined,
      country: raw.country?.code ?? undefined,
    },
    isActive: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
