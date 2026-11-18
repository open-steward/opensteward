/**
 * Transform a raw Cheqroom location record into the canonical Location schema.
 *
 * Cheqroom location fields:
 *   _id, name, address (free-text string)
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawCheqroomLocation {
  _id: string
  name?: string
  /** Free-text address string */
  address?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawCheqroomLocation): Location {
  return {
    id: raw._id,
    externalId: raw._id,
    name: pickStr(raw.name) ?? '',
    type: 'warehouse',
    isActive: true,
    platform: 'cheqroom',
    metadata: strMap({ address: raw.address }),
    raw,
  }
}
