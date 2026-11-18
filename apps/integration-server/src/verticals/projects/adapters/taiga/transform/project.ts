import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTaigaProject {
  id: number
  name?: string
  slug?: string
  description?: string
  is_private?: boolean
  owner?: { id?: number; username?: string }
  created_date?: string
  modified_date?: string
  total_milestones?: number
  total_fans?: number
  total_activity?: number
  tags_colors?: Record<string, string | null>
  [key: string]: unknown
}

function mapStatus(raw: RawTaigaProject): ProjectStatus {
  if (raw.is_private === false) return 'active'
  return 'active'
}

export function transformProject(raw: RawTaigaProject): Project {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    startDate: undefined,
    endDate: undefined,
    createdAt: toIso(raw.created_date),
    updatedAt: toIso(raw.modified_date),
    platform: 'taiga',
    metadata: strMap({
      slug: raw.slug,
      isPrivate: raw.is_private,
      totalMilestones: raw.total_milestones,
    }),
    raw,
  }
}
