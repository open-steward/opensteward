import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

/**
 * Raw StockLocation record from InvenTree GET /api/stock/location/ or GET /api/stock/location/{id}/
 * Source: InvenTree API schema v265, Location schema.
 */
export interface RawInvenTreeLocation {
  pk: number
  name?: string
  pathstring?: string        // full path e.g. "Warehouse / Shelf A / Bin 1"
  description?: string
  parent?: number | null     // parent location ID
  items?: number             // count of stock items here
  structural?: boolean       // structural (grouping only, cannot hold stock)
  external?: boolean         // external location
  icon?: string | null
  tags?: string[]
  [key: string]: unknown
}

export function transformLocation(raw: RawInvenTreeLocation): Location {
  const id = String(raw.pk)
  return {
    id,
    externalId: id,
    name: pickStr(raw.pathstring) ?? pickStr(raw.name) ?? '',
    code: undefined,
    type: raw.external ? 'virtual' : 'warehouse',
    parentLocationId: raw.parent != null ? String(raw.parent) : undefined,
    address: undefined,
    isActive: raw.structural !== true,
    platform: 'inventree',
    metadata: strMap({
      shortName: raw.name,
      description: raw.description,
      itemCount: raw.items,
      structural: raw.structural,
      external: raw.external,
    }),
    raw,
  }
}
