import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickNum, pickStr, refId, refName, strMap, toIso, type CzReference } from './shared'

/**
 * A canonical Task maps to an AdaptiveWork **Task** entity (a WorkItem
 * subtype). `id` is the `/Task/<uuid>` URI. `Project` is the owning project
 * reference, `Parent` the parent work item, `Manager` the assignee/owner.
 * `State` is the lifecycle ("Active", "Completed", "On Hold", "Cancelled",
 * "Draft", …) and `Priority` is the named priority ("Low" … "Critical").
 */
export interface RawClarizenTask {
  id: string
  Name?: string
  Description?: string
  State?: string | { id?: string; Name?: string }
  PercentCompleted?: number
  Priority?: string | { id?: string; Name?: string }
  DueDate?: string
  WorkItemType?: string
  Project?: CzReference
  Parent?: CzReference
  Manager?: CzReference
  CreatedOn?: string
  LastUpdatedOn?: string
  [key: string]: unknown
}

/** Read an enum-like value whether it arrives as a string or a reference. */
function enumText(v: RawClarizenTask['State']): string | undefined {
  if (typeof v === 'string') return v
  return pickStr(v?.Name ?? v?.id)
}

function mapStatus(raw: RawClarizenTask): TaskStatus {
  const s = (enumText(raw.State) ?? '').toLowerCase()
  if (s.includes('complet')) return 'closed'
  if (s.includes('cancel')) return 'cancelled'
  if (s.includes('review') || s.includes('approval')) return 'in_review'
  if (s.includes('hold') || s.includes('draft') || s.includes('proposed')) return 'open'
  if (s.includes('active') || s.includes('progress')) return 'in_progress'
  // Fall back to completion percentage when no recognizable State.
  const pct = pickNum(raw.PercentCompleted)
  if (pct != null && pct >= 100) return 'closed'
  if (pct != null && pct > 0) return 'in_progress'
  return 'open'
}

function mapPriority(raw: RawClarizenTask): TaskPriority | undefined {
  const p = (enumText(raw.Priority) ?? '').toLowerCase()
  if (p.includes('critic') || p.includes('urgent')) return 'urgent'
  if (p.includes('high')) return 'high'
  if (p.includes('normal') || p.includes('medium')) return 'medium'
  if (p.includes('low')) return 'low'
  return undefined
}

export function transformTask(raw: RawClarizenTask, projectId?: string): Task {
  const pid = projectId ?? refId(raw.Project) ?? ''
  return {
    id: raw.id,
    externalId: raw.id,
    projectId: pid,
    parentId: refId(raw.Parent),
    title: pickStr(raw.Name) ?? '',
    description: pickStr(raw.Description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.DueDate),
    assigneeIds: refId(raw.Manager) ? [refId(raw.Manager) as string] : [],
    // AdaptiveWork has no first-class tag/label entity on work items.
    tagIds: [],
    createdAt: toIso(raw.CreatedOn),
    updatedAt: toIso(raw.LastUpdatedOn),
    platform: 'planview-adaptivework',
    metadata: strMap({
      platformType: raw.Parent ? 'subtask' : 'task',
      workItemType: pickStr(raw.WorkItemType),
      state: enumText(raw.State),
      priority: enumText(raw.Priority),
      percentCompleted: pickNum(raw.PercentCompleted),
      projectName: refName(raw.Project),
      managerName: refName(raw.Manager),
    }),
    raw,
  }
}
