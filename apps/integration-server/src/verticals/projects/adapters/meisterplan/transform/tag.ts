import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Meisterplan "role" → canonical Tag.
 *
 * Roles are the closest entity to a tag in Meisterplan — they categorise
 * resources and allocations.  They are global (not workspace-scoped), so
 * `workspaceId` is left empty unless the caller provides a context id.
 *
 * Key API fields: id, name, externalId
 */
export interface RawMeisterplanRole {
  id: string
  name?: string | null
  externalId?: string | null
  [key: string]: unknown
}

export function transformTag(raw: RawMeisterplanRole, workspaceId?: string): Tag {
  return {
    id: raw.id,
    externalId: pickStr(raw.externalId) ?? raw.id,
    workspaceId: workspaceId ?? '',
    name: pickStr(raw.name) ?? raw.id,
    color: undefined,
    platform: 'meisterplan',
    metadata: strMap({}),
    raw,
  }
}
