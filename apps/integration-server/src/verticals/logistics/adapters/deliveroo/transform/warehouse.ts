import type { Warehouse } from '../../../schema/warehouse'
import { toAddress } from '../../shared/transform'

/**
 * Raw Deliveroo restaurant/site as returned by
 * GET /signature/v1/restaurants
 *
 * The Signature API exposes restaurant "sites" as the nearest concept
 * to a warehouse — they represent the physical origin location from which
 * Deliveroo couriers collect and dispatch orders.
 *
 * Endpoint confirmed:
 * https://api-docs.deliveroo.com/reference/get-restaurants
 */
export interface DeliverooRestaurantRaw {
  id?: string | null
  restaurant_id?: string | null
  name?: string | null
  /** Whether the site is currently available for delivery. */
  visible?: boolean | null
  status?: string | null
  address?: {
    address1?: string | null
    address2?: string | null
    city?: string | null
    postcode?: string | null
    country_code?: string | null
    [key: string]: unknown
  } | null
  /** Estimated delivery time in minutes. */
  estimated_delivery_time?: number | null
  timezone?: string | null
  [key: string]: unknown
}

/**
 * List envelope from GET /signature/v1/restaurants.
 */
export interface DeliverooRestaurantListRaw {
  restaurants?: DeliverooRestaurantRaw[] | null
  [key: string]: unknown
}

export function transformWarehouse(raw: DeliverooRestaurantRaw): Warehouse {
  const id = raw.restaurant_id ?? raw.id ?? undefined
  const addrRaw = raw.address
    ? {
        address1: raw.address.address1,
        address2: raw.address.address2,
        city: raw.address.city,
        postal_code: raw.address.postcode,
        country_code: raw.address.country_code,
      }
    : null

  return {
    id,
    name: raw.name ?? undefined,
    address: toAddress(addrRaw),
    isActive: raw.visible != null ? Boolean(raw.visible) : undefined,
    timezone: raw.timezone ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
