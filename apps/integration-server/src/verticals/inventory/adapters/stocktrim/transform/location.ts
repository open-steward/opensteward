import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

/** Shape returned by GET /api/Locations */
export interface RawStockTrimLocation {
  locationCode: string
  locationName?: string
  externalId?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawStockTrimLocation): Location {
  return {
    id: raw.locationCode,
    externalId: raw.externalId ?? raw.locationCode,
    name: pickStr(raw.locationName) ?? raw.locationCode,
    code: raw.locationCode,
    type: 'warehouse',
    isActive: true,
    platform: 'stocktrim',
    metadata: strMap({}),
    raw,
  }
}
