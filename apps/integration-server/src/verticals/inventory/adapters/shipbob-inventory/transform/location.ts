import type { Location } from '../../../schema/location'
import type { Address } from '@opensteward/shared'

/**
 * `GET /2026-01/fulfillment-center` — the centres THIS merchant uses.
 *
 * ShipBob exposes two location-shaped endpoints and they answer different
 * questions. Verified live against the sandbox on 2026-09-18:
 *
 *   /location            ShipBob's entire fulfilment network — 69 centres, of
 *                        which 65 come back `access_granted: false`. Needs the
 *                        `locations_read` scope.
 *   /fulfillment-center  the 8 centres this merchant actually uses. Needs no
 *                        scope beyond what the other resources here require.
 *
 * This adapter reads the second, and the reason is referential rather than
 * convenience. The location ids our stock levels emit were 7, 9, 10, 80, 81,
 * 82, 83 and 85; `/fulfillment-center` returned exactly 80, 81, 82, 83, 7, 9,
 * 10, 85 — the same set, eight for eight. A canonical inventory Location is
 * where stock sits, so this is the endpoint under which every
 * `stockLevel.locationId` resolves to a location we actually returned.
 *
 * It was `/location` until the live run: a token carrying products_read,
 * inventory_read and receiving_read read every other resource and got an
 * empty-bodied 401 here, because `/location` alone needs `locations_read`.
 * Asking for that extra scope would have worked, but it is the wrong fix —
 * it would buy the right to download 61 warehouses the merchant cannot use,
 * to answer a question `/fulfillment-center` already answers exactly.
 *
 * Fields (live, 2026-09-18):
 *   id, name, timezone, address1, address2, city, state, country, zip_code,
 *   phone_number, email
 *
 * The address is flat on the record here, unlike `/location`, which nests one
 * per entry in `services[]`. `timezone` is a Windows identifier ("Pacific
 * Standard Time"), not IANA, so it stays on `raw` rather than being mapped to
 * a field implying IANA.
 */
export interface RawShipBobFulfillmentCenter {
  id?: number
  name?: string | null
  timezone?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  zip_code?: string | null
  phone_number?: string | null
  email?: string | null
  [key: string]: unknown
}

/** ShipBob sends "" rather than null for an unset field. */
function present(v: string | null | undefined): string | undefined {
  const t = v?.trim()
  return t ? t : undefined
}

function toAddress(raw: RawShipBobFulfillmentCenter): Address | undefined {
  const address: Address = {
    line1: present(raw.address1),
    line2: present(raw.address2),
    city: present(raw.city),
    region: present(raw.state),
    postalCode: present(raw.zip_code),
    country: present(raw.country),
  }
  // A centre that reports nothing at all gets no address rather than an object
  // of six undefineds, which would read as "we have an address" downstream.
  return Object.values(address).some((v) => v !== undefined) ? address : undefined
}

export function transformLocation(raw: RawShipBobFulfillmentCenter): Location {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    name: present(raw.name) ?? '',
    // The record carries no abbreviation; `/location` did, but that is not the
    // endpoint this reads.
    code: undefined,
    // Every ShipBob location is a fulfilment centre; the API models no other
    // kind, so the type is not inferred from a field that does not exist.
    type: 'warehouse',
    address: toAddress(raw),
    // `/fulfillment-center` returns only the merchant's own centres — there is
    // no inactive half to distinguish, unlike `/location`.
    isActive: true,
    platform: 'shipbob-inventory',
    // No canonical Location field holds these, and on `raw` alone they are lost
    // wherever strip-raw-payload runs. `timezone` stays the Windows identifier
    // ShipBob sends ("Pacific Standard Time"), not a guessed IANA zone.
    metadata: contactDetail(raw),
    raw: raw as unknown as Record<string, unknown>,
  }
}

function contactDetail(raw: RawShipBobFulfillmentCenter): Record<string, string> {
  const out: Record<string, string> = {}
  const timezone = present(raw.timezone)
  const email = present(raw.email)
  const phoneNumber = present(raw.phone_number)
  if (timezone) out['timezone'] = timezone
  if (email) out['email'] = email
  if (phoneNumber) out['phoneNumber'] = phoneNumber
  return out
}
