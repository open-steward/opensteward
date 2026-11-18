import type { Task, TaskStatus } from '../../../schema'
import { pickStr, pickNum, strMap, toIso } from './shared'

/**
 * Nifty task (GET /tasks → `tasks`).
 *
 * Status is modelled as a kanban column reference (`task_group_id`) plus a
 * boolean `completed` flag — Nifty has no fixed status taxonomy, so the only
 * status the canonical schema can derive reliably is open vs. closed. Subtasks
 * point to their parent via `task_id`. Nifty carries no per-task priority
 * field, so `priority` is left undefined.
 */
export interface RawNiftyTask {
  id: string
  name?: string
  description?: string | null
  project?: string | null
  task_group_id?: string | null
  task_id?: string | null
  milestone_id?: string | null
  due_date?: string | null
  start_date?: string | null
  assignees?: string[] | null
  labels?: string[] | null
  story_points?: number | null
  completed?: boolean
  completed_on?: string | null
  archived?: boolean
  total_subtasks?: number | null
  created_at?: string | null
  updated_at?: string | null
  created_by?: string | null
  [key: string]: unknown
}

function mapStatus(raw: RawNiftyTask): TaskStatus {
  return raw.completed ? 'closed' : 'open'
}

export function transformTask(raw: RawNiftyTask, projectId?: string): Task {
  const pid = projectId ?? pickStr(raw.project) ?? ''
  return {
    id: raw.id,
    externalId: raw.id,
    projectId: pid,
    parentId: pickStr(raw.task_id),
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    dueDate: toIso(raw.due_date),
    assigneeIds: (raw.assignees ?? []).filter((id): id is string => typeof id === 'string'),
    tagIds: (raw.labels ?? []).filter((id): id is string => typeof id === 'string'),
    subtaskCount: pickNum(raw.total_subtasks),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'nifty',
    metadata: strMap({
      platformType: raw.task_id ? 'subtask' : 'task',
      taskGroupId: raw.task_group_id,
      milestoneId: raw.milestone_id,
      storyPoints: raw.story_points,
      startDate: toIso(raw.start_date),
      completedOn: toIso(raw.completed_on),
      archived: raw.archived,
    }),
    raw,
  }
}
