import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw project object returned by Kanboard's getProjectById / getAllProjects.
 * Numeric fields come back as strings from the API.
 *
 * Docs: https://docs.kanboard.org/v1/api/project_procedures/
 */
export interface RawKanboardProject {
  id: string | number
  name?: string
  description?: string
  is_active?: string | number | boolean
  is_private?: string | number | boolean
  is_public?: string | number | boolean
  owner_id?: string | number
  identifier?: string
  email?: string
  last_modified?: string | number
  start_date?: string | number
  end_date?: string | number
  [key: string]: unknown
}

function mapStatus(raw: RawKanboardProject): ProjectStatus {
  const active = String(raw.is_active ?? '1')
  if (active === '0' || active === 'false') return 'archived'
  return 'active'
}

export function transformProject(raw: RawKanboardProject): Project {
  const id = String(raw.id)
  const ownerId = raw.owner_id ? String(raw.owner_id) : undefined

  return {
    id,
    externalId: id,
    // Kanboard has no workspace concept — use empty string; callers may set
    // workspaceId from the project list context.
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId,
    startDate: toIso(raw.start_date),
    endDate: toIso(raw.end_date),
    createdAt: undefined,
    updatedAt: toIso(raw.last_modified),
    platform: 'kanboard',
    metadata: strMap({
      identifier: raw.identifier,
      isPrivate: raw.is_private,
      isPublic: raw.is_public,
      email: raw.email,
    }),
    raw,
  }
}
