/**
 * Aha! Release → canonical Project.
 *
 * A release is a time-boxed deliverable that belongs to a product (workspace).
 * Aha! has no "archived" flag on releases; status is derived from the
 * `released` and `parking_lot` (un-scheduled backlog bucket) booleans.
 *
 * Never throws — missing optionals resolve to `undefined`.
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawAhaRelease {
  id: string
  reference_num?: string
  name?: string
  start_date?: string
  release_date?: string
  parking_lot?: boolean
  released?: boolean
  product_id?: string
  owner?: { id: string; name?: string; email?: string } | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(raw: RawAhaRelease): ProjectStatus {
  if (raw.released) return 'completed'
  if (raw.parking_lot) return 'on_hold'
  return 'active'
}

export function transformProject(raw: RawAhaRelease, workspaceId?: string): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: workspaceId ?? pickStr(raw.product_id) ?? '',
    name: pickStr(raw.name) ?? '',
    status: mapStatus(raw),
    ownerId: pickStr(raw.owner?.id),
    startDate: toIso(raw.start_date),
    endDate: toIso(raw.release_date),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'aha',
    metadata: strMap({
      referenceNum: raw.reference_num,
      parkingLot: raw.parking_lot,
      released: raw.released,
    }),
    raw,
  }
}
