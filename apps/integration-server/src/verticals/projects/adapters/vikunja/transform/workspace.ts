import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Vikunja does not have a first-class "workspace" concept. Top-level projects
 * are treated as workspaces in the canonical model. This transform maps a
 * Vikunja Project that is being used as a workspace container to the canonical
 * Workspace object.
 *
 * In practice, `listWorkspaces` returns the set of root-level projects (those
 * with `parent_project_id == null / 0`).
 */
export interface RawVikunjaWorkspace {
  id: number
  title?: string
  description?: string
  identifier?: string
  hex_color?: string
  owner?: {
    id?: number
    username?: string
    name?: string
    [key: string]: unknown
  } | null
  is_archived?: boolean
  created?: string
  updated?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawVikunjaWorkspace): Workspace {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.title) ?? '',
    platform: 'vikunja',
    metadata: strMap({
      identifier: raw.identifier,
      hexColor: raw.hex_color,
      isArchived: raw.is_archived,
      ownerUsername: raw.owner?.username,
    }),
    raw,
  }
}
