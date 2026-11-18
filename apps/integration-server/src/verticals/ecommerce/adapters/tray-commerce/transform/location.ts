/**
 * Tray Multi-CD (distribution center) → canonical Location.
 *
 * Verified with curl against developers.tray.com.br (see `client.ts`
 * header). Multi-CD is a structurally different, newer JSON API than the
 * rest of this adapter:
 *
 *   - LIST (`#listagem-de-cd-get`): `GET /multicd/distribution-centers
 *     ?access_token=`. Response: `{filtering, sorting, paging:{number, size,
 *     total, from, to, links}, data:[{id, store_id, document, name, main,
 *     status, postal_code, country, state, city, address, number,
 *     neighborhood, complement, configs:{config_zipcodes}, created_at,
 *     updated_at}]}`.
 *   - GET (`#consultar-cd-get`): `GET /multicd/distribution-centers/{id}
 *     ?access_token=` — same object shape plus `zipcodes[]`.
 *   - `status` is a genuine JSON boolean here (`true`/`false`), unlike the
 *     `0`/`1` convention on the legacy CakePHP endpoints.
 *   - `country` in the example is the free-text `"Brasil"`, not an ISO
 *     code; canonical `Address.country` is `Iso3166Alpha2`, so it is
 *     hardcoded to `'BR'` here rather than passed through — Tray is a
 *     Brazil-only platform, so this is a platform fact, not a per-record
 *     guess.
 */
import type { Location } from '../../../schema/location'

export interface RawTrayCd {
  id: number | string
  name: string
  main?: boolean
  status?: boolean
  postal_code?: string
  country?: string
  state?: string
  city?: string
  address?: string
  number?: string
  neighborhood?: string
  complement?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawTrayCd): Location {
  return {
    id: String(raw.id),
    name: raw.name,
    active: typeof raw.status === 'boolean' ? raw.status : undefined,
    address: {
      line1: raw.address ?? undefined,
      line2: raw.complement ?? undefined,
      city: raw.city ?? undefined,
      region: raw.state ?? undefined,
      postalCode: raw.postal_code ?? undefined,
      country: 'BR',
    },
    isFulfillmentCenter: typeof raw.main === 'boolean' ? raw.main : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
