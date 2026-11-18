/**
 * Transform a raw Ruddr task object into the canonical Task schema.
 *
 * Ruddr project task statusId values:
 *   not_started | in_progress | completed
 *
 * recordStatusId: active | archived
 *
 * Every field read here is in the documented `Task` schema of GET /tasks and
 * GET /tasks/{id}, including `modifiedAt` ("The timestamp when the object was
 * last modified.") and `project` ("The project this task belongs to.").
 *
 * Docs: https://docs.ruddr.io/api-reference/tasks/list-tasks.md
 */
import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawRuddrProjectTask {
  id: string
  name?: string
  notes?: string | null
  order?: number | null
  position?: number | null
  statusId?: string
  start?: string | null
  end?: string | null
  isBillable?: boolean
  lockTime?: boolean
  capHours?: boolean
  capAssignedHours?: boolean
  code?: string | null
  forAssignedOnly?: boolean
  requireNotes?: boolean
  recordStatusId?: string
  budgetedHours?: number | null
  budgetedServicesRevenue?: number | null
  createdAt?: string
  modifiedAt?: string
  project?: { id: string; name?: string; client?: { id: string; name?: string } | null } | null
  parent?: { id: string; name?: string } | null
  roles?: Array<{ id: string; name?: string; hours?: number | null }> | null
  projectMembers?: Array<{
    id: string
    member?: { id: string; name?: string } | null
    hours?: number | null
  }>
  tags?: Array<{ id: string; name?: string }>
  taskCategory?: { id: string; name?: string; type?: string } | null
  [key: string]: unknown
}

function mapTaskStatus(raw: RawRuddrProjectTask): TaskStatus {
  if (raw.recordStatusId === 'archived') return 'closed'
  switch (raw.statusId) {
    case 'not_started':
      return 'open'
    case 'in_progress':
      return 'in_progress'
    case 'completed':
      return 'closed'
    default:
      return 'unknown'
  }
}

export function transformTask(raw: RawRuddrProjectTask): Task {
  const projectId = pickStr(raw.project?.id)
  if (!projectId) throw new Error(`Ruddr task ${raw.id} has no project.id`)

  const title = pickStr(raw.name)
  if (!title) throw new Error(`Ruddr task ${raw.id} has no name`)

  const assigneeIds = (raw.projectMembers ?? [])
    .map((pm) => pm.member?.id)
    .filter((id): id is string => Boolean(id))

  const tagIds = (raw.tags ?? []).map((t) => t.id).filter((id): id is string => Boolean(id))

  return {
    id: raw.id,
    externalId: raw.id,
    projectId,
    parentId: pickStr(raw.parent?.id),
    title,
    description: pickStr(raw.notes ?? undefined),
    status: mapTaskStatus(raw),
    priority: undefined,
    dueDate: toIso(raw.end ?? undefined),
    assigneeIds,
    tagIds,
    subtaskCount: undefined,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.modifiedAt),
    platform: 'ruddr',
    metadata: strMap({
      code: raw.code,
      isBillable: raw.isBillable,
      budgetedHours: raw.budgetedHours,
      taskCategoryId: raw.taskCategory?.id,
      taskCategoryName: raw.taskCategory?.name,
      taskCategoryType: raw.taskCategory?.type,
      recordStatusId: raw.recordStatusId,
    }),
    raw,
  }
}
