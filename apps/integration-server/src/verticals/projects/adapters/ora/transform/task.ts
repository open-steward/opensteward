/**
 * Ora task (card) transform.
 *
 * Ora API task fields (from GET /projects/:id/tasks):
 *   id, title, description, project_id, list_id, parent_id,
 *   due_date, completed (boolean), assignees (array of user objects),
 *   labels (array of label objects with id/name/color),
 *   priority (0=none,1=low,2=medium,3=high,4=urgent),
 *   created_at, updated_at
 */
import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawOraTask {
  id: string | number
  title?: string
  description?: string
  project_id?: string | number
  list_id?: string | number
  parent_id?: string | number | null
  due_date?: string | null
  completed?: boolean
  /** Array of user objects; each has at least an `id` field */
  assignees?: Array<{ id: string | number }>
  /** Array of label objects; each has at least an `id` field */
  labels?: Array<{ id: string | number }>
  /** 0=none, 1=low, 2=medium, 3=high, 4=urgent */
  priority?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(raw: RawOraTask): TaskStatus {
  if (raw.completed) return 'closed'
  return 'open'
}

function mapPriority(raw: RawOraTask): TaskPriority | undefined {
  switch (raw.priority) {
    case 4:
      return 'urgent'
    case 3:
      return 'high'
    case 2:
      return 'medium'
    case 1:
      return 'low'
    default:
      return undefined
  }
}

export function transformTask(raw: RawOraTask, projectId?: string): Task {
  const id = String(raw.id)
  const pid = projectId ?? (raw.project_id != null ? String(raw.project_id) : '')
  return {
    id,
    externalId: id,
    projectId: pid,
    parentId: raw.parent_id != null ? String(raw.parent_id) : undefined,
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.due_date),
    assigneeIds: (raw.assignees ?? []).map((a) => String(a.id)),
    tagIds: (raw.labels ?? []).map((l) => String(l.id)),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'ora',
    metadata: strMap({
      listId: raw.list_id,
      isSubtask: raw.parent_id != null ? 'true' : undefined,
    }),
    raw,
  }
}
