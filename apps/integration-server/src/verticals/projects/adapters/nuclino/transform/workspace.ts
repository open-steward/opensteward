/**
 * Transform a raw Nuclino Team object into a canonical Workspace.
 *
 * Nuclino teams are the top-level organisational unit (analogous to
 * workspaces in other tools).  Each team contains one or more workspaces
 * which we map to canonical Projects.
 *
 * Team object fields:
 *   object, id, url, name, createdAt, createdUserId
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawNuclinoTeam {
  object?: string
  id: string
  url?: string
  name?: string
  createdAt?: string
  createdUserId?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawNuclinoTeam): Workspace {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    platform: 'nuclino',
    metadata: strMap({
      url: raw.url,
      createdUserId: raw.createdUserId,
      createdAt: toIso(raw.createdAt),
    }),
    raw,
  }
}
