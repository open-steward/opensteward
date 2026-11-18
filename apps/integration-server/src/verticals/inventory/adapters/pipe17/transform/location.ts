/**
 * Pipe17 /locations endpoint -> Location schema.
 *
 * Pipe17 location key fields:
 *   locationId, name, type, address (street, city, state, zip, country),
 *   active, integration
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawPipe17Location {
  locationId?: string
  name?: string
  type?: string
  active?: boolean | string
  integration?: string
  address?: {
    street?: string
    street2?: string
    city?: string
    state?: string
    zip?: string
    country?: string
  }
  [key: string]: unknown
}

export function transformLocation(raw: RawPipe17Location): Location {
  const id = pickStr(raw.locationId) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    type: 'warehouse',
    address: raw.address ? {
      line1: raw.address.street,
      line2: raw.address.street2,
      city: raw.address.city,
      region: raw.address.state,
      country: raw.address.country,
      postalCode: raw.address.zip,
    } : undefined,
    isActive: pickBool(raw.active) ?? true,
    platform: 'pipe17',
    metadata: strMap({
      type: raw.type,
      integration: raw.integration,
    }),
    raw,
  }
}
