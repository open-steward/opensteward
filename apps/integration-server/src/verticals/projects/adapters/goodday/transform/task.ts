import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * GoodDay task object returned by GET /project/{id}/tasks and GET /task/{id}.
 *
 * priority: 0=none, 1=low, 2=medium, 3=high, 4=urgent/critical
 * systemStatus: "open", "closed", "cancelled"
 */
export interface RawGooddayTask {
  id: string
  shortId?: string | null
  name?: string | null
  message?: string | null
  projectId?: string | null
  parentTaskId?: string | null
  assignedToUserId?: string | null
  createdByUserId?: string | null
  deadline?: number | string | null
  startDate?: number | string | null
  endDate?: number | string | null
  momentCreated?: number | string | null
  recentActivityMoment?: number | string | null
  priority?: number | null
  estimate?: number | null
  progress?: number | null
  systemStatus?: string | null
  status?: { id?: string; name?: string; systemStatus?: string } | null
  taskType?: { id?: string; name?: string } | null
  users?: Array<{ id?: string; access?: string }> | null
  subtasks?: Array<{ id: string }> | null
  customFieldsData?: unknown
  [key: string]: unknown
}

function mapStatus(raw: RawGooddayTask): TaskStatus {
  const s = (
    raw.systemStatus ??
    raw.status?.systemStatus ??
    ''
  ).toLowerCase()
  if (s === 'closed' || s === 'cancelled' || s === 'canceled') return 'closed'
  return 'open'
}

function mapPriority(raw: RawGooddayTask): TaskPriority | undefined {
  switch (raw.priority) {
    case 4:
      return 'urgent'
    case 3:
      return 'high'
    case 2:
      return 'medium'
    case 1:
      return 'low'
    default:
      return undefined
  }
}

export function transformTask(raw: RawGooddayTask, projectId?: string): Task {
  const pid = projectId ?? pickStr(raw.projectId) ?? ''
  const assigneeId = pickStr(raw.assignedToUserId)
  return {
    id: raw.id,
    externalId: raw.id,
    projectId: pid,
    parentId: pickStr(raw.parentTaskId),
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.message),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.deadline ?? raw.endDate),
    assigneeIds: assigneeId ? [assigneeId] : [],
    tagIds: [],
    subtaskCount: Array.isArray(raw.subtasks) ? raw.subtasks.length : undefined,
    createdAt: toIso(raw.momentCreated),
    updatedAt: toIso(raw.recentActivityMoment),
    platform: 'goodday',
    metadata: strMap({
      shortId: raw.shortId,
      taskTypeId: raw.taskType?.id,
      taskTypeName: raw.taskType?.name,
      createdByUserId: raw.createdByUserId,
      statusId: raw.status?.id,
      statusName: raw.status?.name,
    }),
    raw,
  }
}
