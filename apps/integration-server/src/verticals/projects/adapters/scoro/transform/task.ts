/**
 * Transform a raw Scoro task into the canonical Task schema.
 *
 * Scoro task key fields (API v2, module: "tasks"):
 *   event_id            – integer task identifier
 *   event_name          – task title
 *   description         – task body
 *   status              – opaque slug (task_status1–task_status4)
 *   is_completed        – boolean
 *   priority_id         – 1=high, 2=normal, 3=low
 *   project_id          – associated project (integer)
 *   parent_id           – parent task id for subtasks (integer | null)
 *   related_users       – array of user IDs (assignees)
 *   datetime_due        – "YYYY-MM-DD HH:mm:ss"
 *   start_datetime      – "YYYY-MM-DD HH:mm:ss"
 *   created_date        – "YYYY-MM-DD HH:mm:ss"
 *   modified_date       – "YYYY-MM-DD HH:mm:ss"
 *   subtask_ids         – array of child task IDs
 */
import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawScoroTask {
  event_id?: number | string
  event_name?: string
  description?: string
  status?: string
  is_completed?: boolean | string | number
  priority_id?: number | string
  project_id?: number | string
  parent_id?: number | string | null
  related_users?: Array<number | string>
  datetime_due?: string
  start_datetime?: string
  created_date?: string
  modified_date?: string
  subtask_ids?: Array<number | string>
  [key: string]: unknown
}

function mapStatus(raw: RawScoroTask): TaskStatus {
  if (
    raw.is_completed === true ||
    raw.is_completed === 1 ||
    raw.is_completed === '1'
  ) {
    return 'closed'
  }
  return 'open'
}

function mapPriority(raw: RawScoroTask): TaskPriority | undefined {
  const p = Number(raw.priority_id)
  if (p === 1) return 'high'
  if (p === 2) return 'medium'
  if (p === 3) return 'low'
  return undefined
}

export function transformTask(raw: RawScoroTask, projectId?: string): Task {
  const id = String(raw.event_id ?? '')
  const pid = projectId ?? (raw.project_id != null ? String(raw.project_id) : '')
  const assigneeIds = (raw.related_users ?? []).map(String)
  const subtaskCount = Array.isArray(raw.subtask_ids) ? raw.subtask_ids.length : undefined

  return {
    id,
    externalId: id,
    projectId: pid,
    parentId: raw.parent_id != null ? String(raw.parent_id) : undefined,
    title: pickStr(raw.event_name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.datetime_due),
    assigneeIds,
    tagIds: [],
    subtaskCount,
    createdAt: toIso(raw.created_date),
    updatedAt: toIso(raw.modified_date),
    platform: 'scoro',
    metadata: strMap({
      status: raw.status,
      platformType: raw.parent_id != null ? 'subtask' : 'task',
    }),
    raw,
  }
}
