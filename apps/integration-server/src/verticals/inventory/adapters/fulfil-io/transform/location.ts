import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap, m2oId, m2oName} from './shared'

/**
 * Fulfil stock.location record.
 *
 * Location types include: storage, lost_found, production, supplier, customer, view.
 * We map storage + view locations as warehouse/area types.
 */
export interface RawFulfilLocation {
  /** Integer record id */
  id: number
  /** Display name */
  name?: string | null
  /** Full code / path */
  code?: string | null
  /** Parent location (Many2One) */
  parent?: [number, string] | null
  /** Location type: storage | lost_found | production | supplier | customer | view */
  type?: string | null
  /** Whether active */
  active?: boolean
  /** Whether this is a flat storage location */
  flat_childs?: boolean
  create_date?: string | null
  write_date?: string | null
  [key: string]: unknown
}

/** Fields to request from the API for stock.location. */
export const LOCATION_FIELDS = [
  'id', 'name', 'code', 'parent', 'type', 'active', 'flat_childs', 'create_date', 'write_date',
]

function mapLocationType(type: string | null | undefined): Location['type'] {
  switch (type) {
    case 'storage': return 'warehouse'
    case 'view': return 'area'
    case 'supplier': return 'supplier'
    case 'customer': return 'customer'
    default: return 'warehouse'
  }
}

export function transformLocation(raw: RawFulfilLocation): Location {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name ?? undefined) ?? '',
    code: pickStr(raw.code ?? undefined),
    type: mapLocationType(raw.type ?? undefined),
    parentLocationId: m2oId(raw.parent),
    isActive: pickBool(raw.active) ?? true,
    platform: 'fulfil-io',
    metadata: strMap({
      locationType: raw.type,
      parentName: m2oName(raw.parent),
    }),
    raw,
  }
}
