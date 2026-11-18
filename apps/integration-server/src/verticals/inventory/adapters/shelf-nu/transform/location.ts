/**
 * Transform a Shelf.nu location (GET /api/mobile/locations) to the canonical Location schema.
 *
 * Shelf locations represent physical storage places: rooms, cabinets, shelves, etc.
 * The address field is a free-text string (not structured). parentId supports
 * a hierarchical location tree.
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawShelfNuLocation {
  id: string
  name: string
  description?: string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  image?: { url?: string } | null
  parentId?: string | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawShelfNuLocation): Location {
  return {
    id: raw.id,
    externalId: raw.id,
    name: raw.name,
    code: undefined,
    type: 'warehouse',
    parentLocationId: pickStr(raw.parentId),
    // Shelf stores address as a single free-text string; put it in line1.
    address: raw.address ? { line1: raw.address } : undefined,
    isActive: true,
    platform: 'shelf-nu',
    metadata: strMap({
      description: raw.description,
      latitude: raw.latitude,
      longitude: raw.longitude,
    }),
    raw,
  }
}
