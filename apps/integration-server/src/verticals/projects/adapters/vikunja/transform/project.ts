import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw Vikunja Project object returned by GET /projects and GET /projects/{id}.
 *
 * Fields sourced from the Go model (pkg/models/project.go):
 *   id, title, description, identifier, hex_color, owner, parent_project_id,
 *   is_archived, is_favorite, position, max_permission, created, updated.
 */
export interface RawVikunjaProject {
  id: number
  title?: string
  description?: string
  identifier?: string
  hex_color?: string
  owner?: RawVikunjaUser
  parent_project_id?: number | null
  is_archived?: boolean
  is_favorite?: boolean
  position?: number
  created?: string
  updated?: string
  [key: string]: unknown
}

interface RawVikunjaUser {
  id?: number
  username?: string
  name?: string
  email?: string
  [key: string]: unknown
}

function mapStatus(raw: RawVikunjaProject): ProjectStatus {
  if (raw.is_archived) return 'archived'
  return 'active'
}

export function transformProject(raw: RawVikunjaProject): Project {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    // Vikunja has no workspace concept — we use the parent project id as the
    // workspace id, or fall back to '0' for top-level projects.
    workspaceId: raw.parent_project_id ? String(raw.parent_project_id) : '0',
    name: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    startDate: undefined,
    endDate: undefined,
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.updated),
    platform: 'vikunja',
    metadata: strMap({
      identifier: raw.identifier,
      hexColor: raw.hex_color,
      isFavorite: raw.is_favorite,
      parentProjectId: raw.parent_project_id,
    }),
    raw,
  }
}
