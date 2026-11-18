/**
 * Toggl Plan project transform.
 *
 * GET /{workspace_id}/projects returns an array of project objects.
 * Projects in Toggl Plan are scheduling containers — they have name,
 * color, archived flag, and timestamps.
 *
 * Docs: https://developers.plan.toggl.com/api-v5.html
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTogglPlanProject {
  id: number | string
  name?: string
  /** Hex color string, e.g. "#FF6600" */
  color?: string
  color_id?: number
  archived?: boolean
  /** Array of tag IDs attached to the project */
  tags?: number[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(raw: RawTogglPlanProject): ProjectStatus {
  if (raw.archived) return 'archived'
  return 'active'
}

export function transformProject(raw: RawTogglPlanProject, workspaceId?: string): Project {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    workspaceId: workspaceId ?? '',
    name: pickStr(raw.name) ?? '',
    description: undefined,
    status: mapStatus(raw),
    ownerId: undefined,
    startDate: undefined,
    endDate: undefined,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'toggl-plan',
    metadata: strMap({
      color: raw.color,
      colorId: raw.color_id,
      tagIds: Array.isArray(raw.tags) ? raw.tags.join(',') : undefined,
    }),
    raw,
  }
}
