import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Nifty project: ProjectResponse, the rows of GET /api/v1.0/projects
 * (`{ projects, hasMore }`) and the body of GET /api/v1.0/projects/{id}.
 * Spec: https://developers.niftypm.com/docs/api/v1.0/1.0/nifty-v1-openapi.json
 *
 * Nifty exposes no per-project lifecycle status beyond the `archived` /
 * `removed` flags; active projects map to `active`, archived/removed ones to
 * `archived`. `progress` (documented `number`, 42 in the spec's example) is
 * kept in metadata. ProjectResponse documents no created/updated timestamps,
 * so none are read.
 */
export interface RawNiftyProject {
  id: string
  nice_id?: string | null
  name: string
  description?: string | null
  initials?: string | null
  color?: string | null
  secondary_color?: string | null
  owner?: string | null
  members?: string[] | null
  subteam?: string | null
  archived?: boolean
  removed?: boolean
  progress?: number | null
  access_type?: string | null
  total_story_points?: number | null
  completed_story_points?: number | null
  [key: string]: unknown
}

function mapStatus(raw: RawNiftyProject): ProjectStatus {
  if (raw.archived || raw.removed) return 'archived'
  return 'active'
}

export function transformProject(raw: RawNiftyProject): Project {
  // ProjectResponse lists `subteam` as required; the canonical workspaceId
  // has no other source, so a project without one is refused, not invented.
  const workspaceId = pickStr(raw.subteam)
  if (workspaceId === undefined) {
    throw new Error(`Nifty project ${raw.id} has no subteam: workspaceId cannot be derived`)
  }
  // `name` is required by ProjectResponse; never substitute an empty string.
  if (typeof raw.name !== 'string') {
    throw new Error(`Nifty project ${raw.id} has no name`)
  }
  return {
    id: raw.id,
    externalId: raw.id,
    // Nifty groups projects under a subteam (portfolio); use it as the workspace.
    workspaceId,
    name: raw.name,
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: pickStr(raw.owner),
    platform: 'nifty',
    metadata: strMap({
      niceId: raw.nice_id,
      initials: raw.initials,
      color: raw.color,
      accessType: raw.access_type,
      progress: raw.progress,
      memberCount: raw.members?.length,
      totalStoryPoints: raw.total_story_points,
      completedStoryPoints: raw.completed_story_points,
    }),
    raw,
  }
}
