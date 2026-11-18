import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw task object returned by Kanboard's getTask / getAllTasks.
 * All numeric fields are returned as strings by the API.
 *
 * Docs: https://docs.kanboard.org/v1/api/task_procedures/
 */
export interface RawKanboardTask {
  id: string | number
  title?: string
  description?: string
  project_id?: string | number
  column_id?: string | number
  swimlane_id?: string | number
  owner_id?: string | number
  creator_id?: string | number
  category_id?: string | number
  color_id?: string
  is_active?: string | number | boolean
  date_due?: string | number
  date_creation?: string | number
  date_modification?: string | number
  date_started?: string | number
  date_completed?: string | number
  priority?: string | number
  score?: string | number
  position?: string | number
  reference?: string
  [key: string]: unknown
}

/** Kanboard task priority: 0=low, 1=normal, 2=high, 3=urgent */
function mapPriority(raw: RawKanboardTask): TaskPriority | undefined {
  const p = Number(raw.priority ?? -1)
  if (p === 0) return 'low'
  if (p === 1) return 'medium'
  if (p === 2) return 'high'
  if (p >= 3) return 'urgent'
  return undefined
}

/** is_active=1 → open, is_active=0 → closed */
function mapStatus(raw: RawKanboardTask): TaskStatus {
  const active = String(raw.is_active ?? '1')
  if (active === '0' || active === 'false') return 'closed'
  return 'open'
}

export function transformTask(raw: RawKanboardTask, projectId?: string): Task {
  const id = String(raw.id)
  const pid = projectId ?? (raw.project_id ? String(raw.project_id) : '')
  const assigneeId = raw.owner_id ? String(raw.owner_id) : undefined

  return {
    id,
    externalId: id,
    projectId: pid,
    parentId: undefined, // Kanboard tasks don't have parent tasks; subtasks are separate
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.date_due),
    assigneeIds: assigneeId ? [assigneeId] : [],
    tagIds: [], // Tags are fetched via getTaskTags; not included in base task response
    subtaskCount: undefined,
    createdAt: toIso(raw.date_creation),
    updatedAt: toIso(raw.date_modification),
    platform: 'kanboard',
    metadata: strMap({
      columnId: raw.column_id,
      swimlaneId: raw.swimlane_id,
      categoryId: raw.category_id,
      colorId: raw.color_id,
      creatorId: raw.creator_id,
      reference: raw.reference,
      score: raw.score,
    }),
    raw,
  }
}
