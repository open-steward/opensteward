import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Weeek project shape.
 * Returned by GET /tm/projects → { success, projects: RawWeeekProject[] }
 * and GET /tm/projects/{id} → { success, project: RawWeeekProject }
 *
 * Weeek does not expose created_at/updated_at for projects in the v1 API.
 */
export interface RawWeeekProject {
  id: number | string
  title?: string
  description?: string | null
  color?: string | null
  logoLink?: string | null
  isPrivate?: boolean
  /** Array of member IDs (first member treated as owner) */
  team?: Array<number | string>
  [key: string]: unknown
}

function mapStatus(_raw: RawWeeekProject): ProjectStatus {
  // Weeek v1 does not expose an archive flag on the project list endpoint.
  return 'active'
}

export function transformProject(raw: RawWeeekProject, workspaceId = ''): Project {
  const id = String(raw.id)
  const ownerId = raw.team && raw.team.length > 0 ? String(raw.team[0]) : undefined
  return {
    id,
    externalId: id,
    workspaceId,
    name: pickStr(raw.title) ?? '',
    description: pickStr(raw.description ?? undefined),
    status: mapStatus(raw),
    ownerId,
    platform: 'weeek',
    metadata: strMap({
      color: raw.color,
      logoLink: raw.logoLink,
      isPrivate: raw.isPrivate,
    }),
    raw,
  }
}
