import type { Task } from '../../../schema'
import { pickStr, pickNum, strMap, isTruthy } from './shared'

/**
 * Float "project task" — a named task definition on a project's task list
 * (`GET /project-tasks`), NOT a scheduled allocation. Project tasks carry no
 * assignee, status, or due date; they group billable work under an optional
 * phase. The phase is surfaced as the canonical `parentId`.
 *
 * Float's single-task lookups are project-scoped, so the canonical task id is
 * the composite `{project_id}:{task_id}` emitted below; `splitScopedId` in
 * index.ts decodes it.
 */
export interface RawFloatProjectTask {
  task_id?: number | string
  project_task_id?: number | string
  project_id?: number | string
  phase_id?: number | string | null
  name?: string
  billable?: number | boolean
  budget?: number | string | null
  count_tasks?: number | string
  created?: string | null
  modified?: string | null
  [key: string]: unknown
}

function rawTaskId(raw: RawFloatProjectTask): string {
  const v = raw.task_id ?? raw.project_task_id
  return v != null ? String(v) : ''
}

export function transformTask(raw: RawFloatProjectTask, projectId?: string): Task {
  const taskId = rawTaskId(raw)
  const pid = projectId ?? (raw.project_id != null ? String(raw.project_id) : '')
  const phaseId = raw.phase_id != null ? String(raw.phase_id) : undefined
  return {
    id: pid ? `${pid}:${taskId}` : taskId,
    externalId: taskId,
    projectId: pid,
    parentId: phaseId,
    title: pickStr(raw.name) ?? '',
    status: 'open',
    assigneeIds: [],
    tagIds: [],
    createdAt: undefined,
    updatedAt: undefined,
    platform: 'float',
    metadata: strMap({
      platformType: 'project_task',
      phaseId,
      billable: isTruthy(raw.billable),
      budget: pickNum(raw.budget),
      countTasks: pickNum(raw.count_tasks),
    }),
    raw,
  }
}
