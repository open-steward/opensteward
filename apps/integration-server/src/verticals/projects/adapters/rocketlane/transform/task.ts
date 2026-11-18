import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Shape returned by GET /tasks and GET /tasks/{taskId}.
 *
 * Tasks in Rocketlane belong to a project and optionally to a phase.
 * Assignees is an array of user objects. Priority is a string field.
 */
export interface RawRocketlaneTask {
  taskId?: number | string
  taskName?: string
  description?: string
  status?: string // e.g. "TODO", "IN_PROGRESS", "DONE", "BLOCKED"
  priority?: string // e.g. "HIGH", "MEDIUM", "LOW", "URGENT"
  projectId?: number | string
  phaseId?: number | string
  parentTaskId?: number | string | null
  startDate?: string
  dueDate?: string
  startDateActual?: string
  dueDateActual?: string
  progress?: number
  assignees?: Array<{ userId?: number | string }>
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(raw: RawRocketlaneTask): TaskStatus {
  const s = (raw.status ?? '').toString().toUpperCase()
  if (s === 'DONE' || s === 'COMPLETED') return 'closed'
  if (s === 'IN_PROGRESS') return 'in_progress'
  if (s === 'BLOCKED') return 'in_progress'
  return 'open'
}

function mapPriority(raw: RawRocketlaneTask): TaskPriority | undefined {
  const p = (raw.priority ?? '').toString().toUpperCase()
  if (p === 'URGENT' || p === 'CRITICAL') return 'urgent'
  if (p === 'HIGH') return 'high'
  if (p === 'MEDIUM' || p === 'NORMAL') return 'medium'
  if (p === 'LOW') return 'low'
  return undefined
}

export function transformTask(raw: RawRocketlaneTask, projectId?: string): Task {
  const id = String(raw.taskId ?? '')
  const pid = projectId ?? (raw.projectId != null ? String(raw.projectId) : '')
  const assigneeIds = (raw.assignees ?? [])
    .map((a) => (a.userId != null ? String(a.userId) : ''))
    .filter(Boolean)

  return {
    id,
    externalId: id,
    projectId: pid,
    parentId: raw.parentTaskId != null ? String(raw.parentTaskId) : undefined,
    title: pickStr(raw.taskName) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.dueDate),
    assigneeIds,
    tagIds: [],
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'rocketlane',
    metadata: strMap({
      phaseId: raw.phaseId,
      status: raw.status,
      priority: raw.priority,
      progress: raw.progress,
      startDate: raw.startDate,
      startDateActual: raw.startDateActual,
      dueDateActual: raw.dueDateActual,
    }),
    raw,
  }
}
