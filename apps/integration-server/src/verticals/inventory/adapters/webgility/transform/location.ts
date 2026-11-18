/**
 * Webgility Connect location transform.
 *
 * Webgility Connect does not expose a warehouse/location endpoint. This
 * module provides a synthetic transform for the "default" virtual location
 * that is used alongside stock-level records derived from Items.
 *
 * If Webgility adds a warehouse endpoint in future, update RawWebgilityLocation
 * and transformLocation with real field names.
 */
import type { Location } from '../../../schema/location'
import {strMap} from './shared'

export interface RawWebgilityLocation {
  /** Synthetic or real location identifier */
  locationId: string
  name?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawWebgilityLocation): Location {
  return {
    id: raw.locationId,
    externalId: raw.locationId,
    name: raw.name ?? raw.locationId,
    code: undefined,
    type: 'warehouse',
    parentLocationId: undefined,
    address: undefined,
    isActive: true,
    platform: 'webgility',
    metadata: strMap({}),
    raw,
  }
}
