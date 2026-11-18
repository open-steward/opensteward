/**
 * Weekdone item → canonical Task.
 *
 * GET /items returns:
 *   { status: 'ok', items: [{ id, description, type_id, team_id, user_id,
 *       priority, from_id, source, due_on, commentcount, likecount,
 *       inserted, ... }] }
 *
 * Items are weekly-report entries (Plans, Progress, Problems, KPIs).
 * `type_id` maps to the category type; there is no explicit "completed"
 * flag — items with a past week period are treated as closed.
 */
import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, pickNum, strMap, toIso } from './shared'

export interface RawWeekdoneItem {
  id: number | string
  description?: string
  type_id?: number          // 1=Plans, 2=Progress, 3=Problems, custom
  team_id?: number | string
  user_id?: number | string
  priority?: number         // numeric priority, lower = higher
  from_id?: number | string // parent item id (for sub-items)
  due_on?: string
  inserted?: string         // creation datetime ISO
  updated?: string
  commentcount?: number
  [key: string]: unknown
}

function mapStatus(_raw: RawWeekdoneItem): TaskStatus {
  // Weekdone items don't carry an explicit closed flag; default to open
  return 'open'
}

function mapPriority(raw: RawWeekdoneItem): TaskPriority | undefined {
  const p = pickNum(raw.priority)
  if (p == null) return undefined
  if (p === 1) return 'urgent'
  if (p === 2) return 'high'
  if (p === 3) return 'medium'
  if (p >= 4) return 'low'
  return undefined
}

function mapTypeLabel(typeId: number | undefined): string {
  switch (typeId) {
    case 1: return 'plans'
    case 2: return 'progress'
    case 3: return 'problems'
    default: return typeId != null ? String(typeId) : 'unknown'
  }
}

export function transformTask(raw: RawWeekdoneItem, projectId?: string): Task {
  const id = String(raw.id)
  const pid = projectId ?? (raw.team_id != null ? String(raw.team_id) : '')
  const userId = raw.user_id != null ? String(raw.user_id) : undefined
  return {
    id,
    externalId: id,
    projectId: pid,
    parentId: raw.from_id != null ? String(raw.from_id) : undefined,
    title: pickStr(raw.description) ?? '',
    description: undefined,
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.due_on),
    assigneeIds: userId ? [userId] : [],
    tagIds: [],
    subtaskCount: undefined,
    createdAt: toIso(raw.inserted),
    updatedAt: toIso(raw.updated),
    platform: 'weekdone',
    metadata: strMap({
      typeId: raw.type_id,
      typeLabel: mapTypeLabel(pickNum(raw.type_id)),
      commentCount: raw.commentcount,
    }),
    raw,
  }
}
