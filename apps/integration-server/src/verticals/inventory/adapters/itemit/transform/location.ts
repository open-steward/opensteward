/**
 * itemit location-profile → canonical Location transform.
 *
 * itemit locations are named places where assets are stored/tracked.
 * Fields: id, name, type, colour, createdAt, workspace, _itemCount.
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap, toIso} from './shared'

/** Map itemit location type strings to canonical LocationType values. */
function mapLocationType(raw: unknown): Location['type'] {
  if (typeof raw !== 'string') return 'unknown'
  switch (raw.toLowerCase()) {
    case 'warehouse':
    case 'storage':
    case 'depot':
      return 'warehouse'
    case 'store':
    case 'shop':
      return 'store'
    case 'virtual':
      return 'virtual'
    case 'transit':
    case 'in_transit':
      return 'transit'
    case 'supplier':
      return 'supplier'
    default:
      return 'unknown'
  }
}

export interface RawItemitLocation {
  id: string
  name?: string
  type?: string
  colour?: string
  createdAt?: string
  created?: {
    at?: { timestamp?: string }
    by?: { id?: string; name?: string; type?: string }
  }
  workspace?: string
  _itemCount?: number
  [key: string]: unknown
}

export function transformLocation(raw: RawItemitLocation): Location {
  const createdAt = toIso(raw.createdAt) ?? toIso(raw.created?.at?.timestamp)

  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    type: mapLocationType(raw.type),
    isActive: true,
    platform: 'itemit',
    metadata: strMap({
      colour: raw.colour,
      workspace: raw.workspace,
      createdAt,
      itemCount: raw._itemCount !== undefined ? String(raw._itemCount) : undefined,
    }),
    raw,
  }
}
