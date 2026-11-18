import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Weeek task shape.
 * Returned by GET /tm/tasks → { success, hasMore, tasks: RawWeeekTask[] }
 * and GET /tm/tasks/{id} → { success, task: RawWeeekTask }
 *
 * priority: 0 = none, 1 = low, 2 = medium, 3 = high, 4 = urgent
 * type: 'action' | 'meet' | 'call'
 */
export interface RawWeeekTask {
  id: number | string
  parentId?: number | string | null
  title?: string
  description?: string | null
  dateStart?: string | null
  dateEnd?: string | null
  timeStart?: string | null
  timeEnd?: string | null
  priority?: number
  isCompleted?: boolean
  isDeleted?: boolean
  authorId?: number | string | null
  /** Array of member IDs assigned to this task */
  assignees?: Array<number | string>
  projectId?: number | string | null
  boardId?: number | string | null
  boardColumnId?: number | string | null
  /** Array of tag IDs */
  tags?: Array<number | string>
  type?: string
  image?: string | null
  isPrivate?: boolean
  [key: string]: unknown
}

function mapStatus(raw: RawWeeekTask): TaskStatus {
  if (raw.isCompleted) return 'closed'
  return 'open'
}

/**
 * Weeek priority levels:
 *   0 = none, 1 = low, 2 = medium, 3 = high, 4 = urgent
 */
function mapPriority(raw: RawWeeekTask): TaskPriority | undefined {
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

export function transformTask(raw: RawWeeekTask, projectId?: string): Task {
  const id = String(raw.id)
  const pid = projectId ?? (raw.projectId != null ? String(raw.projectId) : '')
  const parentId = raw.parentId != null ? String(raw.parentId) : undefined
  // Prefer dateEnd as the canonical due date; fall back to dateStart
  const dueDate = toIso(raw.dateEnd ?? raw.dateStart)
  return {
    id,
    externalId: id,
    projectId: pid,
    parentId,
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.description ?? undefined),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate,
    assigneeIds: (raw.assignees ?? []).map(String),
    tagIds: (raw.tags ?? []).map(String),
    createdAt: undefined,
    updatedAt: undefined,
    platform: 'weeek',
    metadata: strMap({
      platformType: parentId ? 'subtask' : 'task',
      type: raw.type,
      boardId: raw.boardId,
      boardColumnId: raw.boardColumnId,
      isPrivate: raw.isPrivate,
    }),
    raw,
  }
}
