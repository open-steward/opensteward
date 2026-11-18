/**
 * Transform a raw Xentral warehouse to the canonical Location schema.
 *
 * Source: GET /api/v1/warehouses
 *
 * The Xentral V1 warehouse list only returns id, project, and designation.
 * Storage locations within a warehouse are a separate sub-resource
 * (/api/v1/warehouses/{id}/storageLocations) and are mapped as child locations.
 *
 * Key field mappings:
 *   id          → id / externalId
 *   designation → name
 *   project.id  → metadata.projectId
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawXentralWarehouse {
  id: string
  designation?: string
  project?: { id?: string }
  [key: string]: unknown
}

export function transformLocation(raw: RawXentralWarehouse): Location {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.designation) ?? '',
    type: 'warehouse',
    isActive: true,
    platform: 'xentral',
    metadata: strMap({ projectId: raw.project?.id }),
    raw,
  }
}
