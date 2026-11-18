import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso, pickNum } from './shared'

/**
 * ProductPlan "bar" — an item on a roadmap lane.
 *
 * Key fields (from /api/v2/roadmaps/{id}/bars and /api/v2/bars/{id}):
 *   id, name, description, starts_on, ends_on, percent_done,
 *   parked, container, effort, updated_at,
 *   lane   { id, value },
 *   parent { id, name },
 *   tags   [{ id, value }],
 *   legend { id, value, label }
 */
export interface RawProductplanBar {
  id?: number | string
  name?: string
  description?: string
  notes?: string
  starts_on?: string
  ends_on?: string
  percent_done?: number | null
  parked?: boolean
  container?: boolean
  effort?: number
  updated_at?: string
  lane?: { id?: number | string; value?: string } | Array<{ id?: number | string; value?: string }>
  parent?: { id?: number | string; name?: string } | null
  tags?: Array<{ id?: number | string; value?: string }>
  legend?: { id?: number | string; value?: string; label?: string } | Array<unknown>
  [key: string]: unknown
}

function mapStatus(raw: RawProductplanBar): TaskStatus {
  const pct = pickNum(raw.percent_done)
  if (pct === 100) return 'closed'
  if (raw.parked) return 'on_hold'
  return 'open'
}

function getLaneId(raw: RawProductplanBar): string | undefined {
  const lane = raw.lane
  if (!lane) return undefined
  if (Array.isArray(lane)) return lane[0]?.id != null ? String(lane[0].id) : undefined
  return lane.id != null ? String(lane.id) : undefined
}

function getParentId(raw: RawProductplanBar): string | undefined {
  if (!raw.parent) return undefined
  return raw.parent.id != null ? String(raw.parent.id) : undefined
}

export function transformTask(raw: RawProductplanBar, roadmapId?: string): Task {
  const id = String(raw.id ?? '')
  const tagIds = (raw.tags ?? []).map((t) => String(t.id ?? '')).filter(Boolean)
  return {
    id,
    externalId: id,
    projectId: roadmapId ?? '',
    parentId: getParentId(raw),
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.description) ?? pickStr(raw.notes),
    status: mapStatus(raw),
    priority: undefined,
    dueDate: toIso(raw.ends_on),
    assigneeIds: [],
    tagIds,
    subtaskCount: undefined,
    createdAt: undefined,
    updatedAt: toIso(raw.updated_at),
    platform: 'productplan',
    metadata: strMap({
      startsOn: raw.starts_on,
      laneId: getLaneId(raw),
      container: raw.container,
      parked: raw.parked,
      effort: raw.effort,
      percentDone: raw.percent_done,
    }),
    raw,
  }
}
