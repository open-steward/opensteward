import type { Warehouse } from '../../../schema/warehouse'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

/**
 * StoreRetrieveResponseSerializer: an item of `GET /v2/stores/` ({ stores })
 * and the body of `GET /v2/stores/{store_id}/`
 * (https://kitchenhub.readme.io/reference/get_v2-stores.md). `id`, `country`
 * and `created_at` are required.
 */
export interface KitchenHubStore {
  id: string
  partner_store_id?: string | null
  store_name?: string | null
  street?: string | null
  city?: string | null
  country?: string | null
  state?: string | null
  zipcode?: string | null
  lat?: number | null
  lon?: number | null
  location_id?: string | null
  created_at?: string | null
  [key: string]: unknown
}

/**
 * The store's street, city, state and zipcode. `country` is documented only
 * as "Restaurant Country", with no format and no example, so it stays in
 * metadata rather than being guessed into an ISO 3166 code.
 */
function toAddress(raw: KitchenHubStore): Address | undefined {
  const address: Address = {
    street1: raw.street ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.zipcode ?? undefined,
  }
  return Object.values(address).some((v) => v !== undefined) ? address : undefined
}

export function transformStore(raw: KitchenHubStore): Warehouse {
  return {
    id: raw.id,
    name: raw.store_name ?? undefined,
    code: raw.partner_store_id ?? undefined,
    address: toAddress(raw),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
