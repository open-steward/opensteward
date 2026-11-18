/**
 * Transform an Unthread user-group object into the canonical Team schema.
 *
 * Unthread user-groups are the closest concept to "teams". They support
 * filtering/assignment and are project-scoped. Fields: id, description,
 * isExternal, filters, projectId.
 *
 * Unthread does not expose a display name on user-groups — we fall back to
 * the id as the name when description is absent.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawUnthreadUserGroup {
  id: string
  description?: string | null
  isExternal?: boolean | null
  projectId?: string | null
  [key: string]: unknown
}

export function transformTeam(raw: RawUnthreadUserGroup): Team {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.description) ?? raw.id,
    memberCount: undefined,
    platform: 'unthread',
    metadata: strMap({
      isExternal: raw.isExternal,
      projectId: raw.projectId,
    }),
    raw,
  }
}
