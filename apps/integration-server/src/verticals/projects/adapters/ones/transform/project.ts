import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * ONES project resource from GET /project/projects.
 *
 * Key fields (verified against ONES OpenAPI v2 docs):
 *   id            — project identifier
 *   name          — display name
 *   createTime    — Unix epoch seconds
 *   owner.id      — owning user id
 *   status.category — "to_do" | "in_progress" | "done" (or raw name)
 *   isArchive     — boolean archive flag
 *   plannedStartDate — "YYYY-MM-DD" string
 *   plannedEndDate   — "YYYY-MM-DD" string
 *
 * Docs: https://docs.ones.com/developer/openapi/api/project
 */
export interface RawOnesProject {
  id?: string
  name?: string
  createTime?: number | string
  updateTime?: number | string
  owner?: { id?: string; name?: string } | string | null
  creator?: { id?: string; name?: string } | string | null
  status?: { id?: string; name?: string; category?: string } | string | null
  statusCategory?: string
  isArchive?: boolean
  archiveTime?: number | string
  archiveUser?: { id?: string; name?: string } | string | null
  plannedStartDate?: string
  plannedEndDate?: string
  stickToTop?: boolean
  [key: string]: unknown
}

function refId(v: RawOnesProject['owner']): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return v
  return v.id
}

function mapStatus(raw: RawOnesProject): ProjectStatus {
  if (raw.isArchive) return 'archived'
  const category =
    typeof raw.status === 'object' && raw.status
      ? (raw.status.category ?? raw.status.name ?? '')
      : typeof raw.status === 'string'
        ? raw.status
        : raw.statusCategory ?? ''
  const s = category.toLowerCase()
  if (s.includes('archive') || s.includes('delet')) return 'archived'
  if (s.includes('done') || s.includes('complet') || s.includes('closed') || s === 'done') {
    return 'completed'
  }
  if (s.includes('pause') || s.includes('suspend') || s.includes('on_hold') || s.includes('hold')) {
    return 'on_hold'
  }
  return 'active'
}

export function transformProject(raw: RawOnesProject): Project {
  const id = raw.id ?? ''
  return {
    id,
    externalId: id,
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    description: undefined,
    status: mapStatus(raw),
    ownerId: refId(raw.owner),
    startDate: toIso(raw.plannedStartDate),
    endDate: toIso(raw.plannedEndDate),
    createdAt: toIso(raw.createTime),
    updatedAt: toIso(raw.updateTime),
    platform: 'ones',
    metadata: strMap({
      statusCategory:
        typeof raw.status === 'object' && raw.status
          ? (raw.status.category ?? raw.status.name)
          : pickStr(raw.status),
      isArchive: raw.isArchive,
    }),
    raw,
  }
}
