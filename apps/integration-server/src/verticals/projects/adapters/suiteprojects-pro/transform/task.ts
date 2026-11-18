/**
 * Transform a raw SuiteProjects Pro project-task record into the canonical Task schema.
 *
 * OpenAir project-task fields used here:
 *   id               – integer, unique task identifier
 *   name             – string, short task description
 *   notes            – string, associated notes
 *   isClosed         – Boolean, task closed status
 *   projectId        – integer, parent project internal ID
 *   parentId         – integer, parent task/phase ID (0/null = top-level)
 *   assignedUsers    – Array of {id}, users directly assigned
 *   startDate        – string($date), scheduled start
 *   calculatedFinishes – string($date), calculated finish date
 *   fnltDate         – string($date), finish-no-later-than date
 *   priority         – integer 1–9
 *   percentComplete  – integer
 *   plannedHours     – number
 *   created          – string($date-time), system-generated
 *   updated          – string($date-time), system-generated
 */
import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso, pickNum } from './shared'

export interface RawSuiteProjectsTask {
  id?: number | string
  name?: string
  notes?: string
  isClosed?: boolean | number
  projectId?: number | string
  parentId?: number | string | null
  assignedUsers?: Array<{ id: number | string }>
  startDate?: string
  calculatedFinishes?: string
  fnltDate?: string
  priority?: number | string
  percentComplete?: number | string
  plannedHours?: number
  created?: string
  updated?: string
  [key: string]: unknown
}

function mapStatus(raw: RawSuiteProjectsTask): TaskStatus {
  if (raw.isClosed === true || raw.isClosed === 1) return 'closed'
  return 'open'
}

function mapPriority(raw: RawSuiteProjectsTask): TaskPriority | undefined {
  // OpenAir priority is an integer 1–9 (lower number = higher priority)
  const p = pickNum(raw.priority)
  if (p == null) return undefined
  if (p <= 2) return 'urgent'
  if (p <= 4) return 'high'
  if (p <= 6) return 'medium'
  return 'low'
}

export function transformTask(raw: RawSuiteProjectsTask, projectId?: string): Task {
  const id = String(raw.id ?? '')
  const pid = projectId ?? (raw.projectId != null ? String(raw.projectId) : '')
  const parentId =
    raw.parentId != null && raw.parentId !== 0 && raw.parentId !== '0'
      ? String(raw.parentId)
      : undefined
  const assigneeIds = (raw.assignedUsers ?? []).map((u) => String(u.id))
  // Prefer calculatedFinishes, fall back to fnltDate
  const dueDate = toIso(raw.calculatedFinishes ?? raw.fnltDate)
  return {
    id,
    externalId: id,
    projectId: pid,
    parentId,
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.notes),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate,
    assigneeIds,
    tagIds: [],
    subtaskCount: undefined,
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.updated),
    platform: 'suiteprojects-pro',
    metadata: strMap({
      startDate: raw.startDate,
      percentComplete: pickNum(raw.percentComplete),
      plannedHours: raw.plannedHours,
    }),
    raw,
  }
}
