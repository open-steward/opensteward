import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw Paymo task (the object under the `tasks` response key). Subtasks in Paymo
 * are a separate resource; a regular task has no parent pointer, so the
 * canonical `parentId` is left undefined here.
 */
export interface RawPaymoTask {
  id: number
  name?: string
  code?: string
  description?: string
  project_id?: number
  tasklist_id?: number
  complete?: boolean
  due_date?: string
  priority?: number | null
  users?: number[]
  billable?: boolean
  created_on?: string
  updated_on?: string
  [key: string]: unknown
}

function mapStatus(raw: RawPaymoTask): TaskStatus {
  return raw.complete ? 'closed' : 'open'
}

/**
 * Paymo encodes priority as an integer (1 = low … 4 = critical/urgent), with
 * 0/null meaning "no priority". Map onto the canonical four-level scale.
 */
function mapPriority(raw: RawPaymoTask): TaskPriority | undefined {
  switch (raw.priority) {
    case 1:
      return 'low'
    case 2:
      return 'medium'
    case 3:
      return 'high'
    case 4:
      return 'urgent'
    default:
      return undefined
  }
}

export function transformTask(raw: RawPaymoTask, projectId?: string): Task {
  const pid = projectId ?? (raw.project_id != null ? String(raw.project_id) : '')
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    projectId: pid,
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.due_date),
    assigneeIds: (raw.users ?? []).map((u) => String(u)),
    tagIds: [],
    createdAt: toIso(raw.created_on),
    updatedAt: toIso(raw.updated_on),
    platform: 'paymo',
    metadata: strMap({
      platformType: 'task',
      code: raw.code,
      tasklistId: raw.tasklist_id,
      billable: raw.billable,
    }),
    raw,
  }
}
