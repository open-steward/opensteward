import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, pickNum, strMap, toIso } from './shared'

/**
 * Buildertrend exposes two task-shaped resources that both fold onto the
 * canonical Task:
 *   - To-Dos: discrete checklist items with a due date and completion flag.
 *   - Schedule items: dated work items, optionally nested under a phase
 *     (parent) and carrying a percent-complete.
 * `kind` distinguishes them for metadata.platformType.
 */
export interface RawBuildertrendTask {
  id: number | string
  jobId?: number | string
  title?: string
  name?: string
  description?: string
  notes?: string
  // To-Do completion.
  completed?: boolean
  isComplete?: boolean
  // Schedule progress (0-100).
  percentComplete?: number
  // Schedule phase nesting → canonical parentId.
  parentId?: number | string
  phaseId?: number | string
  dueDate?: string
  startDate?: string
  endDate?: string
  priority?: string
  assignedToUserId?: number | string
  assignedUsers?: Array<{ id: number | string } | number | string>
  assignedUserIds?: Array<number | string>
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

export type BuildertrendTaskKind = 'todo' | 'schedule'

function mapStatus(raw: RawBuildertrendTask): TaskStatus {
  if (raw.completed === true || raw.isComplete === true) return 'closed'
  if (typeof raw.percentComplete === 'number') {
    if (raw.percentComplete >= 100) return 'closed'
    if (raw.percentComplete > 0) return 'in_progress'
  }
  return 'open'
}

function mapPriority(raw: RawBuildertrendTask): TaskPriority | undefined {
  const v = (raw.priority ?? '').toLowerCase()
  if (v === 'urgent' || v === 'critical') return 'urgent'
  if (v === 'high') return 'high'
  if (v === 'medium' || v === 'normal') return 'medium'
  if (v === 'low') return 'low'
  return undefined
}

function assigneeIds(raw: RawBuildertrendTask): string[] {
  const out: string[] = []
  if (raw.assignedToUserId != null) out.push(String(raw.assignedToUserId))
  for (const a of raw.assignedUsers ?? []) {
    if (a == null) continue
    if (typeof a === 'object') out.push(String((a as { id: number | string }).id))
    else out.push(String(a))
  }
  for (const id of raw.assignedUserIds ?? []) out.push(String(id))
  return [...new Set(out)].filter((s) => s.length > 0)
}

export function transformTask(
  raw: RawBuildertrendTask,
  kind: BuildertrendTaskKind,
  projectId?: string,
): Task {
  const pid = projectId ?? (raw.jobId != null ? String(raw.jobId) : '')
  const parent = raw.parentId ?? raw.phaseId
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    projectId: pid,
    parentId: parent != null ? String(parent) : undefined,
    title: pickStr(raw.title ?? raw.name) ?? '',
    description: pickStr(raw.description ?? raw.notes),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.dueDate ?? raw.endDate),
    assigneeIds: assigneeIds(raw),
    tagIds: [],
    createdAt: toIso(raw.createdDate),
    updatedAt: toIso(raw.modifiedDate),
    platform: 'buildertrend',
    metadata: strMap({
      platformType: kind === 'schedule' ? 'scheduleItem' : 'todo',
      percentComplete: pickNum(raw.percentComplete),
      startDate: toIso(raw.startDate),
    }),
    raw,
  }
}
