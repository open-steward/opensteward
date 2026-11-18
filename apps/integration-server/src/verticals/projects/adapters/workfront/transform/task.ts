import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickNum, pickStr, strMap, toIso } from './shared'

/** Raw Workfront `task` (objCode `TASK`) record. */
export interface RawWorkfrontTask {
  ID: string
  name?: string
  description?: string
  status?: string
  priority?: number
  assignedToID?: string | null
  parentID?: string | null
  projectID?: string
  taskNumber?: number
  numberOfChildren?: number
  plannedCompletionDate?: string
  entryDate?: string
  lastUpdateDate?: string
  percentComplete?: number
  [key: string]: unknown
}

/** Workfront system task status codes: NEW · INP (In Progress) · CPL (Complete). */
function mapStatus(status: string | undefined): TaskStatus {
  switch (status) {
    case 'NEW':
      return 'open'
    case 'INP':
      return 'in_progress'
    case 'CPL':
      return 'closed'
    default:
      return 'unknown'
  }
}

/** Workfront priority is numeric: 0 None · 1 Low · 2 Normal · 3 High · 4 Urgent. */
function mapPriority(priority: number | undefined): TaskPriority | undefined {
  switch (priority) {
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

export function transformTask(raw: RawWorkfrontTask, projectId?: string): Task {
  const pid = projectId ?? pickStr(raw.projectID) ?? ''
  const parentId = pickStr(raw.parentID)
  return {
    id: raw.ID,
    externalId: raw.ID,
    projectId: pid,
    parentId,
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw.status),
    priority: mapPriority(raw.priority),
    dueDate: toIso(raw.plannedCompletionDate),
    assigneeIds: raw.assignedToID ? [raw.assignedToID] : [],
    tagIds: [],
    subtaskCount: pickNum(raw.numberOfChildren),
    createdAt: toIso(raw.entryDate),
    updatedAt: toIso(raw.lastUpdateDate),
    platform: 'workfront',
    metadata: strMap({
      platformType: parentId ? 'subtask' : 'task',
      statusCode: raw.status,
      taskNumber: raw.taskNumber,
      percentComplete: raw.percentComplete,
    }),
    raw,
  }
}
