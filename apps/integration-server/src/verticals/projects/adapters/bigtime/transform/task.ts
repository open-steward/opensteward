import type { Task, TaskPriority, TaskStatus } from '../../../schema'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * BigTime task (`GET /task/listByProject/{ProjectSid}`,
 * `GET /task/detail/{TaskSid}`).
 *
 * `PerComp` is a **0–1 decimal** per the BigTime v2 API spec ("a decimal value
 * between 0 and 1, eg a percentage"). Setting `IsArchived = true` on the API
 * automatically moves `PerComp` to 1.0 (100 %); likewise setting `PerComp`
 * below 1 automatically un-archives the task.
 *
 * BigTime tasks have a `Priority` field (HIGH / MEDIUM / LOW) which is mapped
 * to the canonical TaskPriority enum. Sub-tasks point at their parent via
 * `ParentSid` → `Task.parentId`. Assignees arrive as an `AssignmentList` of
 * staff ids.
 */
export interface RawBigtimeTask {
  TaskSid?: number | string
  ProjectSid?: number | string
  TaskNm?: string
  Notes?: string
  CurrentStatus?: number | string
  IsArchived?: boolean
  PerComp?: number | string
  Priority?: string
  DueDt?: string
  StartDt?: string
  ParentSid?: number | string
  BudgetHours?: number | string
  AssignmentList?: Array<number | string | { StaffSid?: number | string }>
  DtCreated?: string
  DtModified?: string
  [key: string]: unknown
}

/**
 * Map BigTime `PerComp` (0–1 decimal) + `IsArchived` to a canonical
 * TaskStatus.
 *
 * - IsArchived === true  → 'closed'  (API sets PerComp to 1.0 when archived)
 * - PerComp === 1.0      → 'closed'  (100 % complete)
 * - 0 < PerComp < 1     → 'in_progress'
 * - PerComp === 0 / null → 'open'
 */
function mapStatus(raw: RawBigtimeTask): TaskStatus {
  if (raw.IsArchived === true) return 'closed'
  const pct = pickNum(raw.PerComp)
  if (pct != null) {
    if (pct >= 1) return 'closed'      // 1.0 = 100 % complete (0-1 decimal scale)
    if (pct > 0) return 'in_progress'
  }
  return 'open'
}

function mapPriority(raw: RawBigtimeTask): TaskPriority | undefined {
  const p = typeof raw.Priority === 'string' ? raw.Priority.toUpperCase() : ''
  if (p === 'HIGH') return 'high'
  if (p === 'MEDIUM') return 'medium'
  if (p === 'LOW') return 'low'
  return undefined
}

function mapAssignees(raw: RawBigtimeTask): string[] {
  const list = raw.AssignmentList ?? []
  const out: string[] = []
  for (const entry of list) {
    if (entry == null) continue
    if (typeof entry === 'object') {
      const sid = pickStr((entry as { StaffSid?: number | string }).StaffSid)
      if (sid) out.push(sid)
    } else {
      const sid = pickStr(entry)
      if (sid) out.push(sid)
    }
  }
  return out
}

export function transformTask(raw: RawBigtimeTask, projectId?: string): Task {
  const id = pickStr(raw.TaskSid) ?? ''
  const pid = projectId ?? pickStr(raw.ProjectSid) ?? ''
  const parentId = pickStr(raw.ParentSid)
  // PerComp is a 0-1 decimal; convert to 0-100 integer for human-readable metadata.
  const perCompRaw = pickNum(raw.PerComp)
  const percentComplete = perCompRaw != null ? Math.round(perCompRaw * 100) : undefined
  return {
    id,
    externalId: id,
    projectId: pid,
    parentId: parentId && parentId !== '0' ? parentId : undefined,
    title: pickStr(raw.TaskNm) ?? '',
    description: pickStr(raw.Notes),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.DueDt),
    assigneeIds: mapAssignees(raw),
    tagIds: [],
    createdAt: toIso(raw.DtCreated),
    updatedAt: toIso(raw.DtModified),
    platform: 'bigtime',
    metadata: strMap({
      platformType: parentId && parentId !== '0' ? 'subtask' : 'task',
      currentStatus: raw.CurrentStatus,
      percentComplete,
      budgetHours: pickNum(raw.BudgetHours),
      startDate: toIso(raw.StartDt),
    }),
    raw,
  }
}
