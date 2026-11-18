import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Redmine project object returned by GET /projects.json and GET /projects/:id.json.
 *
 * Relevant fields:
 *   id          - numeric project id
 *   identifier  - string slug (e.g. "my-project")
 *   name        - display name
 *   description
 *   status      - 1 = active, 5 = archived, 9 = closed
 *   parent      - { id, name } if sub-project
 *   created_on  - ISO-8601
 *   updated_on  - ISO-8601
 */
export interface RawRedmineProject {
  id: number
  identifier?: string
  name?: string
  description?: string
  status?: number
  parent?: { id: number; name?: string }
  created_on?: string
  updated_on?: string
  [key: string]: unknown
}

function mapStatus(raw: RawRedmineProject): ProjectStatus {
  // Redmine project status: 1 = active, 5 = archived, 9 = closed
  if (raw.status === 5) return 'archived'
  if (raw.status === 9) return 'completed'
  return 'active'
}

export function transformProject(raw: RawRedmineProject): Project {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    // Redmine has no workspace concept — use empty string
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: undefined,
    startDate: undefined,
    endDate: undefined,
    createdAt: toIso(raw.created_on),
    updatedAt: toIso(raw.updated_on),
    platform: 'redmine',
    metadata: strMap({
      identifier: raw.identifier,
      parentId: raw.parent ? String(raw.parent.id) : undefined,
      parentName: raw.parent?.name,
    }),
    raw,
  }
}
