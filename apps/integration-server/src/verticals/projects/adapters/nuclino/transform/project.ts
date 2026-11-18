/**
 * Transform a raw Nuclino Workspace object into a canonical Project.
 *
 * Nuclino workspaces sit inside a team and hold a tree of items/collections.
 * They map cleanly to canonical Projects because they have a name, owner,
 * timestamps, and an explicit teamId (workspaceId at the canonical level).
 *
 * Workspace object fields:
 *   object, id, teamId, name, createdAt, createdUserId, fields, childIds
 */
import type { Project } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawNuclinoWorkspace {
  object?: string
  id: string
  teamId?: string
  name?: string
  createdAt?: string
  createdUserId?: string
  fields?: unknown[]
  childIds?: string[]
  [key: string]: unknown
}

export function transformProject(raw: RawNuclinoWorkspace): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: raw.teamId ?? '',
    name: pickStr(raw.name) ?? '',
    description: undefined,
    status: 'active',
    ownerId: pickStr(raw.createdUserId),
    startDate: undefined,
    endDate: undefined,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.createdAt),
    platform: 'nuclino',
    metadata: strMap({
      childCount: raw.childIds?.length != null ? String(raw.childIds.length) : undefined,
    }),
    raw,
  }
}
