/**
 * GanttPRO task transform.
 *
 * GET /tasks?projectId=X  →  array of RawGanttproTask
 * GET /tasks/{taskId}     →  single RawGanttproTask
 *
 * Status numeric codes: 1=Open, 2=In progress, 3=Done, 4=Closed
 * Priority numeric codes: 1=Lowest … 5=Highest
 * Type: "task" | "project" (sub-project / milestone)
 */
import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, pickNum, strMap, toIso } from './shared'

export interface RawGanttproTask {
  id: number | string
  projectId?: number | string
  ownerId?: number | string
  name?: string
  description?: string
  status?: number | string
  priority?: number | string
  parent?: number | string | null
  type?: string
  progress?: number | string
  startDate?: string
  endDate?: string
  deadline?: string
  duration?: number | string
  estimation?: number | string
  createdAt?: string
  sortorder?: number
  color?: string
  resources?: Array<{ resourceId: number | string; resourceValue?: number }>
  customFields?: Array<{ name: string; value?: unknown }>
  [key: string]: unknown
}

function mapStatus(raw: RawGanttproTask): TaskStatus {
  const s = pickNum(raw.status)
  if (s === 3 || s === 4) return 'closed'
  if (s === 2) return 'in_progress'
  return 'open'
}

function mapPriority(raw: RawGanttproTask): TaskPriority | undefined {
  const p = pickNum(raw.priority)
  if (p == null) return undefined
  if (p >= 5) return 'urgent'
  if (p === 4) return 'high'
  if (p === 3) return 'medium'
  if (p <= 2) return 'low'
  return undefined
}

export function transformTask(raw: RawGanttproTask, projectId?: string): Task {
  const pid = projectId ?? (raw.projectId != null ? String(raw.projectId) : '')
  const assigneeIds = raw.ownerId != null ? [String(raw.ownerId)] : []
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    projectId: pid,
    parentId: raw.parent != null ? String(raw.parent) : undefined,
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.deadline ?? raw.endDate),
    assigneeIds,
    tagIds: [],
    createdAt: toIso(raw.createdAt),
    updatedAt: undefined,
    platform: 'ganttpro',
    metadata: strMap({
      type: raw.type,
      progress: raw.progress,
      duration: raw.duration,
      estimation: raw.estimation,
      startDate: raw.startDate,
      endDate: raw.endDate,
      color: raw.color,
    }),
    raw,
  }
}
