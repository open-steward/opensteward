/**
 * Fluent Commerce Location transform.
 *
 * Fluent GraphQL `locations` returns nodes with:
 *   id, ref, name, type, status, createdOn, updatedOn,
 *   primaryAddress { name, street, city, state, postcode, country, region },
 *   attributes (list of { name, value })
 *
 * Location types in Fluent: STORE, WAREHOUSE, DC, VIRTUAL, DEPOT, etc.
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawFluentCommerceLocation {
  id?: string | number
  ref: string
  name?: string
  type?: string
  status?: string
  createdOn?: string
  updatedOn?: string
  primaryAddress?: {
    name?: string
    street?: string
    city?: string
    state?: string
    postcode?: string
    country?: string
    region?: string
    latitude?: number
    longitude?: number
  }
  attributes?: Array<{ name: string; value?: unknown }>
  [key: string]: unknown
}

function mapLocationType(type: string | undefined): Location['type'] {
  switch ((type ?? '').toUpperCase()) {
    case 'STORE': return 'store'
    case 'WAREHOUSE':
    case 'DC':
    case 'DEPOT': return 'warehouse'
    case 'VIRTUAL': return 'virtual'
    default: return 'warehouse'
  }
}

export function transformLocation(raw: RawFluentCommerceLocation): Location {
  const addr = raw.primaryAddress
  return {
    id: raw.ref,
    externalId: raw.id != null ? String(raw.id) : raw.ref,
    name: pickStr(raw.name) ?? '',
    type: mapLocationType(raw.type),
    isActive: (raw.status ?? '').toUpperCase() !== 'INACTIVE',
    address: addr
      ? {
          line1: addr.street,
          city: addr.city,
          region: addr.state ?? addr.region,
          country: addr.country,
          postalCode: addr.postcode,
        }
      : undefined,
    platform: 'fluent-commerce',
    metadata: strMap({ type: raw.type, status: raw.status }),
    raw,
  }
}
