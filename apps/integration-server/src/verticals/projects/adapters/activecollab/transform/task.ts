import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * ActiveCollab `Task` object (subset).
 *
 * Tasks live under a project and a task-list. Hierarchy is shallow: a task may
 * own subtasks, surfaced here only as a count (`total_subtasks`) — the
 * canonical interface has no list-subtasks method. `labels` is an array of
 * label ids → `tagIds`. Timestamps are epoch seconds; `due_on` is an epoch
 * number (or date string) depending on serialization.
 */
export interface RawActivecollabTask {
  id: number | string
  project_id?: number | string
  name?: string
  body?: string
  body_formatted?: string
  is_completed?: boolean
  completed_on?: number | null
  completed_by_id?: number | null
  assignee_id?: number | null
  delegated_by_id?: number | null
  task_list_id?: number | null
  task_number?: number
  position?: number
  is_important?: boolean
  due_on?: number | string | null
  start_on?: number | string | null
  labels?: Array<number | string>
  total_subtasks?: number
  comments_count?: number
  is_trashed?: boolean
  created_on?: number | null
  created_by_id?: number | null
  updated_on?: number | null
  url_path?: string
  [key: string]: unknown
}

function mapStatus(raw: RawActivecollabTask): TaskStatus {
  if (raw.is_completed) return 'closed'
  return 'open'
}

export function transformTask(raw: RawActivecollabTask, projectId?: string): Task {
  const pid = projectId ?? (raw.project_id != null ? String(raw.project_id) : '')
  const taskId = String(raw.id)
  return {
    // ActiveCollab has no global task-by-id endpoint — the single-task GET is
    // path-scoped under its project. Encode the project id into the canonical
    // id (`{projectId}:{taskId}`) so `getTask`/`listComments` can recover it;
    // `externalId` stays the bare upstream id.
    id: pid ? `${pid}:${taskId}` : taskId,
    externalId: taskId,
    projectId: pid,
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.body),
    status: mapStatus(raw),
    // ActiveCollab tasks have an `is_important` flag rather than a priority
    // scale; surface it through metadata instead of guessing a priority.
    dueDate: toIso(raw.due_on),
    assigneeIds: raw.assignee_id != null ? [String(raw.assignee_id)] : [],
    tagIds: (raw.labels ?? []).map((l) => String(l)),
    subtaskCount: raw.total_subtasks,
    createdAt: toIso(raw.created_on),
    updatedAt: toIso(raw.updated_on),
    platform: 'activecollab',
    metadata: strMap({
      platformType: 'task',
      taskNumber: raw.task_number,
      taskListId: raw.task_list_id,
      isImportant: raw.is_important,
      commentsCount: raw.comments_count,
      urlPath: raw.url_path,
    }),
    raw,
  }
}
