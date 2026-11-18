/**
 * Transform a raw Teamwork Spaces `space` object into the canonical Project.
 *
 * Teamwork Spaces hierarchy:
 *   Installation > Space > Page
 *
 * A "Space" maps to a canonical Project. The installation has no list-spaces
 * workspace equivalent, so workspaceId is set to an empty string (the
 * installation is implicit).
 *
 * Space fields (GET /spaces/api/v1/spaces.json):
 *   id, title, code, state, purpose, icon, spaceColor,
 *   banner, bannerX, bannerY, isHomepageHeaderEnabled,
 *   createdAt, createdBy, updatedAt, updatedBy,
 *   deletedAt, deletedBy, collaborators, collaboratorsCount,
 *   LinkedCategory, projectId, homepage
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawSpacesSpace {
  id: number | string
  title?: string
  purpose?: string
  state?: string
  code?: string
  spaceColor?: string
  icon?: string
  createdAt?: string
  updatedAt?: string
  deletedAt?: string
  createdBy?: { id: number | string } | null
  collaboratorsCount?: number
  projectId?: number | string | null
  [key: string]: unknown
}

function mapStatus(raw: RawSpacesSpace): ProjectStatus {
  if (raw.deletedAt) return 'archived'
  const s = (raw.state ?? '').toLowerCase()
  if (s === 'active') return 'active'
  if (s === 'archived') return 'archived'
  return 'active'
}

export function transformProject(raw: RawSpacesSpace): Project {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    // Spaces has no explicit workspace/company container — leave empty.
    workspaceId: '',
    name: pickStr(raw.title) ?? '',
    description: pickStr(raw.purpose),
    status: mapStatus(raw),
    ownerId: raw.createdBy?.id != null ? String(raw.createdBy.id) : undefined,
    startDate: undefined,
    endDate: undefined,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'teamwork-desk',
    metadata: strMap({
      code: raw.code,
      spaceColor: raw.spaceColor,
      icon: raw.icon,
      collaboratorsCount: raw.collaboratorsCount,
      projectId: raw.projectId,
    }),
    raw,
  }
}
