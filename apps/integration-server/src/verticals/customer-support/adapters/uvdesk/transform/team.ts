/**
 * UVdesk group transform.
 *
 * In UVdesk, "Groups" are the primary team concept (GET /{locale}/api/groups.json):
 *   id, name, description, createdAt, isActive
 *
 * UVdesk also has "Teams" (sub-groups, GET /{locale}/api/sub-groups.json):
 *   id, name, description, isActive
 *
 * We map groups to the canonical Team entity. (sub-groups are a secondary
 * concept within a group and are not separately exposed in the vertical schema.)
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawUvdeskGroup {
  id?: number | string
  name?: string
  description?: string | null
  isActive?: boolean
  createdAt?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawUvdeskGroup): Team {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    name: pickStr(raw.name) ?? '',
    platform: 'uvdesk',
    metadata: strMap({
      description: raw.description,
      isActive: raw.isActive,
    }),
    raw,
  }
}
