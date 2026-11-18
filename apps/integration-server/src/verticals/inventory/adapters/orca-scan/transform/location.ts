/**
 * Orca Scan sheet → Location
 *
 * In Orca Scan, a "sheet" represents a scanning area or workspace.
 * Each sheet maps to an inventory Location.
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawOrcaScanSheet {
  /** Orca Scan internal sheet identifier */
  _id: string
  /** Human-readable sheet name */
  name?: string
  /** ISO-8601 creation timestamp */
  createdAt?: string
  /** ISO-8601 last-updated timestamp */
  updatedAt?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawOrcaScanSheet): Location {
  return {
    id: raw._id,
    externalId: raw._id,
    name: pickStr(raw.name) ?? raw._id,
    code: undefined,
    type: 'warehouse',
    parentLocationId: undefined,
    address: undefined,
    isActive: true,
    platform: 'orca-scan',
    metadata: strMap({}),
    raw,
  }
}
