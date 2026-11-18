/**
 * Transform an InLoox OData `ApiTask` (TaskItem) object into the canonical Task schema.
 *
 * InLoox task fields (from Microsoft Learn connector docs + Swagger):
 *   TaskId          — UUID primary key
 *   Name            — task name
 *   DescriptionHTML — HTML description
 *   ProjectId       — UUID of owning project
 *   StartDateTime   — ISO 8601 date-time
 *   EndDateTime     — ISO 8601 date-time (due date)
 *   WorkAmount      — numeric effort estimate (hours)
 *   GroupId         — UUID of task group / section
 *
 * InLoox does not expose a completion flag, priority field, assignee list, or
 * parent task ID on this endpoint. WorkAmount is preserved in metadata.
 */
import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawInlooxTask {
  TaskId?: string
  Name?: string
  DescriptionHTML?: string
  ProjectId?: string
  StartDateTime?: string
  EndDateTime?: string
  WorkAmount?: number
  GroupId?: string
  [key: string]: unknown
}

function mapStatus(_raw: RawInlooxTask): TaskStatus {
  // InLoox OData task endpoint does not expose a completion/status flag.
  return 'open'
}

export function transformTask(raw: RawInlooxTask, projectId?: string): Task {
  const id = pickStr(raw.TaskId) ?? ''
  const pid = projectId ?? pickStr(raw.ProjectId) ?? ''
  return {
    id,
    externalId: id,
    projectId: pid,
    parentId: undefined,
    title: pickStr(raw.Name) ?? '',
    description: pickStr(raw.DescriptionHTML),
    status: mapStatus(raw),
    priority: undefined,
    dueDate: toIso(raw.EndDateTime),
    assigneeIds: [],
    tagIds: [],
    subtaskCount: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    platform: 'inloox',
    metadata: strMap({
      startDateTime: raw.StartDateTime,
      workAmount: raw.WorkAmount,
      groupId: raw.GroupId,
    }),
    raw,
  }
}
