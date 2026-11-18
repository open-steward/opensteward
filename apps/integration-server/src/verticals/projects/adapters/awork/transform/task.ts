import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** awork task status `type` values (TaskStatusModel.type). */
type AworkTaskStatusType = 'not-started' | 'progress' | 'done' | 'stuck' | string

export interface RawAworkTaskStatus {
  id?: string
  name?: string
  type?: AworkTaskStatusType
  order?: number
  [key: string]: unknown
}

export interface RawAworkTaskAssignee {
  id?: string
  userId?: string
  firstName?: string
  lastName?: string
  [key: string]: unknown
}

export interface RawAworkTaskTag {
  id?: string
  name?: string
  color?: string
  [key: string]: unknown
}

export interface RawAworkTask {
  id: string
  name?: string
  description?: string | null
  taskStatusId?: string
  taskStatus?: RawAworkTaskStatus | null
  isPrio?: boolean
  dueOn?: string | null
  plannedDuration?: number | null
  projectId?: string | null
  baseType?: string
  assignees?: RawAworkTaskAssignee[] | null
  parentId?: string | null
  numberOfSubtasks?: number | null
  createdOn?: string
  updatedOn?: string
  tags?: RawAworkTaskTag[] | null
  [key: string]: unknown
}

function mapStatus(raw: RawAworkTask): TaskStatus {
  const type = (raw.taskStatus?.type ?? '').toLowerCase()
  if (type === 'done') return 'closed'
  if (type === 'progress') return 'in_progress'
  if (type === 'not-started' || type === '') return 'open'
  return 'open'
}

function mapPriority(raw: RawAworkTask): TaskPriority | undefined {
  // awork models priority as a simple boolean flag (`isPrio`).
  return raw.isPrio ? 'high' : undefined
}

function assigneeId(a: RawAworkTaskAssignee): string | undefined {
  return pickStr(a.userId) ?? pickStr(a.id)
}

export function transformTask(raw: RawAworkTask, projectId?: string): Task {
  const pid = projectId ?? pickStr(raw.projectId) ?? ''
  return {
    id: raw.id,
    externalId: raw.id,
    projectId: pid,
    parentId: pickStr(raw.parentId),
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.dueOn),
    assigneeIds: (raw.assignees ?? [])
      .map(assigneeId)
      .filter((id): id is string => id !== undefined),
    tagIds: (raw.tags ?? [])
      .map((t) => pickStr(t.id))
      .filter((id): id is string => id !== undefined),
    subtaskCount: raw.numberOfSubtasks ?? undefined,
    createdAt: toIso(raw.createdOn),
    updatedAt: toIso(raw.updatedOn),
    platform: 'awork',
    metadata: strMap({
      platformType: raw.parentId ? 'subtask' : 'task',
      baseType: raw.baseType,
      taskStatusId: raw.taskStatusId,
      taskStatusName: raw.taskStatus?.name,
      plannedDuration: raw.plannedDuration,
    }),
    raw,
  }
}
