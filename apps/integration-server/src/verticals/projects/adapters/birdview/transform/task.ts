import type { Task, TaskStatus } from '../../../schema'
import { strMap, toIso } from './shared'

/**
 * Birdview PSA `TaskModel` (GET /api/v2/tasks → `TasksResponse.Items`,
 * GET /api/v2/tasks/{id}), per
 * https://app.go.easyprojects.net/api/swagger/v2/swagger.json:
 *   TaskModel = allOf(TaskIdModel {TaskId}, {Name, Description, ParentId,
 *   ProjectId, TaskStatusId, PriorityId, CreatorId, TaskTypeId, CreationDate,
 *   StartDate, EndDate, LastModificationDate, IsMilestone, ...})
 * TaskModel carries no assignees; they come from the task-assignee endpoints.
 */
export interface RawBirdviewTask {
  TaskId: number
  Name: string
  Description?: string | null
  ParentId?: number | null
  ProjectId: number
  TaskStatusId?: number
  PriorityId?: number
  TaskTypeId?: number
  CreationDate?: string | null
  StartDate?: string | null
  EndDate?: string | null
  LastModificationDate?: string | null
  [key: string]: unknown
}

/**
 * Birdview `TaskStatus` (GET /api/v2/lists/taskstatuses →
 * `TaskStatusesResponse.Items`): {TaskStatusId, Name, WorkflowId,
 * TreatAsCompleted, TreatAsHold, TreatAsInactive, TaskTypeId, ...}.
 */
export interface RawBirdviewTaskStatus {
  TaskStatusId: number
  Name?: string
  TreatAsCompleted?: boolean
  TreatAsHold?: boolean
  TreatAsInactive?: boolean
  [key: string]: unknown
}

/**
 * Canonical status from the documented flags only:
 *   TreatAsCompleted            → closed
 *   TreatAsHold / TreatAsInactive, or no status row → unknown (no canonical match)
 *   any other status            → open
 */
function mapStatus(status: RawBirdviewTaskStatus | undefined): TaskStatus {
  if (!status) return 'unknown'
  if (status.TreatAsCompleted === true) return 'closed'
  if (status.TreatAsHold === true || status.TreatAsInactive === true) return 'unknown'
  return 'open'
}

/**
 * @param assigneeIds the `UserId`s of the task's `TaskAssigneeModel` rows.
 * @param status the task's status row from /api/v2/lists/taskstatuses.
 *
 * Priority is not mapped: priorities are an account-defined list of
 * {Id, Name} (GET /api/v2/lists/priorities) with no documented rank, so the
 * PriorityId is kept in metadata instead.
 */
export function transformTask(
  raw: RawBirdviewTask,
  assigneeIds: string[],
  status?: RawBirdviewTaskStatus,
): Task {
  if (raw.TaskId == null) throw new Error('Birdview PSA task has no TaskId')
  if (raw.ProjectId == null) throw new Error(`Birdview PSA task ${raw.TaskId} has no ProjectId`)
  const id = String(raw.TaskId)
  return {
    id,
    externalId: id,
    projectId: String(raw.ProjectId),
    parentId: raw.ParentId != null ? String(raw.ParentId) : undefined,
    title: raw.Name,
    description: raw.Description ?? undefined,
    status: mapStatus(status),
    dueDate: toIso(raw.EndDate),
    assigneeIds,
    tagIds: [],
    createdAt: toIso(raw.CreationDate),
    updatedAt: toIso(raw.LastModificationDate),
    platform: 'birdview',
    metadata: strMap({
      taskStatusId: raw.TaskStatusId,
      statusName: status?.Name,
      priorityId: raw.PriorityId,
      taskTypeId: raw.TaskTypeId,
      startDate: raw.StartDate,
    }),
    raw,
  }
}
