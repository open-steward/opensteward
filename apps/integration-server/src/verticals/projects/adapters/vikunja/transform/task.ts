import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw Vikunja Task object (`models.Task`) returned by GET /tasks and
 * GET /tasks/{id}.
 *
 * Fields sourced from pkg/models/tasks.go:
 *   id, title, description, done, done_at, due_date, project_id,
 *   priority, start_date, end_date, assignees, labels, hex_color,
 *   percent_done, identifier, index, related_tasks, created, updated,
 *   created_by, repeat_after, repeat_mode.
 */
export interface RawVikunjaTask {
  id: number
  title?: string
  description?: string
  done?: boolean
  done_at?: string | null
  due_date?: string | null
  project_id?: number
  priority?: number
  start_date?: string | null
  end_date?: string | null
  assignees?: Array<RawVikunjaAssignee> | null
  labels?: Array<RawVikunjaLabel> | null
  hex_color?: string
  percent_done?: number
  identifier?: string
  index?: number
  created?: string
  updated?: string
  created_by?: RawVikunjaAssignee | null
  repeat_after?: number
  repeat_mode?: number
  [key: string]: unknown
}

interface RawVikunjaAssignee {
  id?: number
  username?: string
  name?: string
  email?: string
  [key: string]: unknown
}

interface RawVikunjaLabel {
  id?: number
  title?: string
  hex_color?: string
  [key: string]: unknown
}

/**
 * Vikunja priority is a numeric field (arbitrary integer set by the user).
 * We map it to the canonical four-value scale:
 *   5 → urgent, 4 → high, 3 → medium, 1–2 → low, 0 → undefined.
 */
function mapPriority(priority: number | undefined): TaskPriority | undefined {
  if (priority == null || priority === 0) return undefined
  if (priority >= 5) return 'urgent'
  if (priority === 4) return 'high'
  if (priority === 3) return 'medium'
  return 'low'
}

function mapStatus(raw: RawVikunjaTask): TaskStatus {
  return raw.done ? 'closed' : 'open'
}

export function transformTask(raw: RawVikunjaTask, projectId?: string): Task {
  const pid = projectId ?? (raw.project_id != null ? String(raw.project_id) : '')
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    projectId: pid,
    parentId: undefined, // Vikunja uses task relations, not a direct parent_id field
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw.priority),
    dueDate: toIso(raw.due_date ?? undefined),
    assigneeIds: (raw.assignees ?? [])
      .filter((a) => a.id != null)
      .map((a) => String(a.id)),
    tagIds: (raw.labels ?? [])
      .filter((l) => l.id != null)
      .map((l) => String(l.id)),
    subtaskCount: undefined,
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.updated),
    platform: 'vikunja',
    metadata: strMap({
      identifier: raw.identifier,
      index: raw.index,
      hexColor: raw.hex_color,
      percentDone: raw.percent_done,
      startDate: raw.start_date ?? undefined,
      endDate: raw.end_date ?? undefined,
    }),
    raw,
  }
}
