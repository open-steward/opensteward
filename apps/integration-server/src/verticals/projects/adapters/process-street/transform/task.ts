/**
 * Transform a Process Street workflow-run Task into the canonical Task shape.
 *
 * Tasks live inside Workflow Runs ("one *instance* of running a Workflow").
 * Documented shape (ListTasksResponse.tasks[] / GetTaskResponse in
 * https://public-api.process.st/api/v1.1/docs/openapi.json; required: id,
 * updatedDate, updatedBy, workflowRunId, status, name, hidden, stopped):
 *   id, name, workflowRunId, status ("NotCompleted" | "Completed"),
 *   dueDate, completedDate, completedBy { id, email, username },
 *   updatedDate, updatedBy, hidden, stopped, taskType, links[]
 *
 * The task carries no workflow id, so the caller passes the Workflow (the
 * canonical project) the run belongs to.
 *
 * Ids: reading a task back needs its run
 * (GET /workflow-runs/{workflowRunId}/tasks/{taskId}), so the canonical id is
 * `<workflowRunId>:<taskId>`. Process Street ids are "opaque 22-character
 * URL-safe strings", which never contain ':'. externalId is the task's own id.
 *
 * Assignees come from a separate endpoint and are not read here; completedBy
 * is who checked the task off, not an assignee, so it goes to metadata.
 */
import type { Task, TaskStatus } from '../../../schema'
import type { ProcessStreetLink } from '../client'
import type { RawProcessStreetUserRef } from './project'
import { strMap, toIso } from './shared'

export interface RawProcessStreetTask {
  id: string
  name: string
  workflowRunId: string
  /** "NotCompleted" | "Completed" */
  status: string
  dueDate?: string
  completedDate?: string
  completedBy?: RawProcessStreetUserRef
  updatedDate: string
  updatedBy?: RawProcessStreetUserRef
  hidden: boolean
  stopped: boolean
  /** "Standard" | "Approval" | "AI" | "Code" (list only) */
  taskType?: string
  links?: ProcessStreetLink[]
}

const ID_SEPARATOR = ':'

export function taskId(workflowRunId: string, id: string): string {
  return `${workflowRunId}${ID_SEPARATOR}${id}`
}

/** Split a canonical task id into its run id and task id, or undefined if it is not one. */
export function parseTaskId(id: string): { workflowRunId: string; taskId: string } | undefined {
  const parts = id.split(ID_SEPARATOR)
  if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined
  return { workflowRunId: parts[0], taskId: parts[1] }
}

function mapStatus(status: string): TaskStatus {
  if (status === 'Completed') return 'closed'
  if (status === 'NotCompleted') return 'open'
  return 'unknown'
}

export function transformTask(raw: RawProcessStreetTask, workflowId: string): Task {
  return {
    id: taskId(raw.workflowRunId, raw.id),
    externalId: raw.id,
    projectId: workflowId,
    title: raw.name,
    status: mapStatus(raw.status),
    dueDate: toIso(raw.dueDate),
    assigneeIds: [],
    tagIds: [],
    updatedAt: toIso(raw.updatedDate),
    platform: 'process-street',
    metadata: strMap({
      workflowRunId: raw.workflowRunId,
      status: raw.status,
      taskType: raw.taskType,
      hidden: raw.hidden,
      stopped: raw.stopped,
      completedDate: raw.completedDate,
      completedById: raw.completedBy?.id,
      updatedById: raw.updatedBy?.id,
    }),
    raw,
  }
}
