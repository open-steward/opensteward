import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

/**
 * MRPeasy does not expose a dedicated locations/warehouses endpoint in v1.
 * Locations in MRPeasy are "sites" referenced by site_id on items and inventory.
 * This transform handles the minimal site object shape derived from inventory data.
 */
export interface RawMrpeasyLocation {
  site_id: number | string
  site_title?: string
  site_code?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawMrpeasyLocation): Location {
  const id = String(raw.site_id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.site_title) ?? id,
    code: pickStr(raw.site_code),
    type: 'warehouse',
    parentLocationId: undefined,
    address: undefined,
    isActive: true,
    platform: 'mrpeasy',
    metadata: strMap({}),
    raw,
  }
}
