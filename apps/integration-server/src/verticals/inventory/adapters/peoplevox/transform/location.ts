/**
 * Transform a Peoplevox "Sites" GetData CSV row into a canonical Location.
 *
 * Template: "Sites"
 * Key fields: Name, Reference
 * (Peoplevox sites are warehouse locations; no address exposed in default template.)
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawPeoplevoxSite {
  /** Human-readable warehouse name */
  Name: string
  /** Unique short code / reference used as site identifier */
  Reference?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawPeoplevoxSite): Location {
  const id = pickStr(raw.Reference) ?? pickStr(raw.Name) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.Name) ?? '',
    code: pickStr(raw.Reference),
    type: 'warehouse',
    parentLocationId: undefined,
    address: undefined,
    isActive: true,
    platform: 'peoplevox',
    metadata: strMap({}),
    raw,
  }
}
