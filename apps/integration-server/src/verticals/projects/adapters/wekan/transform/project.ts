/**
 * Wekan board → canonical Project.
 *
 * Board fields (from GET /api/users/:userId/boards or GET /api/boards/:boardId/export):
 *   _id, title, slug, description, archived, archivedAt, createdAt, modifiedAt,
 *   permission, color, stars, labels[]{_id,name,color},
 *   members[]{userId,isAdmin,isActive}
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'
import { VIRTUAL_WORKSPACE_ID } from '../constants'

export interface RawWekanBoard {
  _id: string
  title?: string
  description?: string
  slug?: string
  archived?: boolean
  archivedAt?: string
  createdAt?: string
  modifiedAt?: string
  permission?: string
  color?: string
  stars?: number
  labels?: Array<{ _id: string; name?: string; color?: string }>
  members?: Array<{ userId: string; isAdmin?: boolean; isActive?: boolean }>
  [key: string]: unknown
}

function mapStatus(raw: RawWekanBoard): ProjectStatus {
  if (raw.archived) return 'archived'
  return 'active'
}

export function transformProject(raw: RawWekanBoard): Project {
  // Derive ownerId: first active admin member, or first member
  const adminMember = raw.members?.find((m) => m.isAdmin && m.isActive !== false)
  const ownerId = adminMember?.userId ?? raw.members?.[0]?.userId

  return {
    id: raw._id,
    externalId: raw._id,
    workspaceId: VIRTUAL_WORKSPACE_ID,
    name: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: pickStr(ownerId),
    startDate: undefined,
    endDate: undefined,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.modifiedAt),
    platform: 'wekan',
    metadata: strMap({
      slug: raw.slug,
      permission: raw.permission,
      color: raw.color,
      stars: raw.stars,
    }),
    raw,
  }
}
