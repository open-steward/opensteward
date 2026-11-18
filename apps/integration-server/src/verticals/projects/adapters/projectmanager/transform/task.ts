/**
 * ProjectManager task → canonical Task transform.
 *
 * TaskDto fields (v4):
 *   id (uuid), projectId, shortId, name, description,
 *   status (TaskStatusDto: id, name, projectId, order, isDone),
 *   project (TaskProjectDto: id, name),
 *   assignees[] (TaskAssigneeDto: id, name, email),
 *   tags[] (TaskTagDto: id, name, color),
 *   plannedStartDate, plannedFinishDate, actualStartDate, actualFinishDate,
 *   percentComplete, isSummary, isLocked, isMilestone,
 *   plannedEffort, actualEffort,
 *   priorityId (integer from task priorities endpoint),
 *   createDate, modifyDate
 *
 * Status: status.isDone === true → closed; otherwise open.
 * Priority: mapped from priorityId name if available; else from id
 *   (ProjectManager priority names are workspace-configurable).
 *
 * Docs: https://developer.projectmanager.com/api-reference/task/query-tasks
 */
import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

interface RawPmTaskStatus {
  id?: string
  name?: string
  projectId?: string
  order?: number
  isDone?: boolean
}

interface RawPmTaskAssignee {
  id?: string
  name?: string
  email?: string
}

interface RawPmTaskTag {
  id?: string
  name?: string
  color?: string | null
}

export interface RawProjectManagerTask {
  id: string
  projectId?: string
  shortId?: string | null
  name?: string | null
  description?: string | null
  status?: RawPmTaskStatus | null
  assignees?: RawPmTaskAssignee[] | null
  tags?: RawPmTaskTag[] | null
  plannedStartDate?: string | null
  plannedFinishDate?: string | null
  actualStartDate?: string | null
  actualFinishDate?: string | null
  percentComplete?: number | null
  isSummary?: boolean
  isLocked?: boolean
  isMilestone?: boolean
  plannedEffort?: number | null
  actualEffort?: number | null
  /** Integer priority id from the task priorities endpoint */
  priorityId?: number | null
  createDate?: string | null
  modifyDate?: string | null
  [key: string]: unknown
}

function mapStatus(raw: RawProjectManagerTask): TaskStatus {
  if (raw.status?.isDone) return 'closed'
  const name = (raw.status?.name ?? '').toLowerCase()
  if (name.includes('done') || name.includes('complet') || name.includes('closed')) return 'closed'
  if (name.includes('progress') || name.includes('active') || name.includes('started')) return 'in_progress'
  return 'open'
}

function mapPriority(raw: RawProjectManagerTask): TaskPriority | undefined {
  // ProjectManager priority ids are integers; without the name we map common
  // conventions: higher number = higher priority in most PM tools.
  // The API returns priorityId but names require a separate lookup.
  if (raw.priorityId == null) return undefined
  const id = raw.priorityId
  // Common mapping: 1=highest, 2=high, 3=medium/normal, 4=low, 5=lowest
  if (id === 1) return 'urgent'
  if (id === 2) return 'high'
  if (id === 3) return 'medium'
  if (id >= 4) return 'low'
  return undefined
}

export function transformTask(raw: RawProjectManagerTask, projectId?: string): Task {
  const pid = projectId ?? raw.projectId ?? ''
  const assigneeIds = (raw.assignees ?? [])
    .map((a) => a.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  const tagIds = (raw.tags ?? [])
    .map((t) => t.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)

  return {
    id: raw.id,
    externalId: raw.id,
    projectId: pid,
    parentId: undefined,
    title: pickStr(raw.name ?? undefined) ?? '',
    description: pickStr(raw.description ?? undefined),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.plannedFinishDate ?? raw.actualFinishDate),
    assigneeIds,
    tagIds,
    subtaskCount: undefined,
    createdAt: toIso(raw.createDate),
    updatedAt: toIso(raw.modifyDate),
    platform: 'projectmanager',
    metadata: strMap({
      shortId: raw.shortId,
      statusName: raw.status?.name,
      percentComplete: raw.percentComplete,
      isSummary: raw.isSummary,
      isMilestone: raw.isMilestone,
      isLocked: raw.isLocked,
      priorityId: raw.priorityId,
    }),
    raw,
  }
}
