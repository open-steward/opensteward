/**
 * Transform Boxstorm location group → canonical Location.
 *
 * Boxstorm (Fishbowl Advanced) does not expose a public REST locations list;
 * location names appear inline on inventory and purchase-order records.
 * We synthesise a Location object from the location string or sub-object
 * that appears in those records.  When the API exposes a locations endpoint
 * in the future, swap the raw type for the real response shape.
 *
 * Current: GET /api/parts/inventory returns location as a string name.
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawBoxstormLocation {
  /** Location identifier (integer primary key or name string) */
  id?: number | string
  name?: string
  /** Parent location id, if the API ever exposes it */
  parentId?: number | string
  active?: boolean
  [key: string]: unknown
}

export function transformLocation(raw: RawBoxstormLocation): Location {
  const id = String(raw.id ?? raw.name ?? '')
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? id,
    type: 'warehouse',
    isActive: raw.active !== false,
    platform: 'boxstorm',
    metadata: strMap({ parentId: raw.parentId }),
    raw,
  }
}
