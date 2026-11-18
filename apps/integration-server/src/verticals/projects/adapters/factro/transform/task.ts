/**
 * Factro task transform.
 *
 * In Factro, "packages" are the task-like work containers within a project.
 * Package fields (camelCase JSON):
 *   id, title, description, startDate, endDate, creationDate, changeDate,
 *   creatorId, officerId, companyId, mandantId, projectId, parentPackageId,
 *   number, plannedEffort, realizedEffort, remainingEffort
 *
 * There is no explicit status/priority on packages; we infer from endDate/dates.
 */
import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawFactroPackage {
  id: string
  title?: string
  description?: string
  startDate?: string
  endDate?: string
  creationDate?: string
  changeDate?: string
  creatorId?: string
  officerId?: string
  companyId?: string
  mandantId?: string
  projectId?: string
  parentPackageId?: string
  number?: number
  plannedEffort?: number
  realizedEffort?: number
  remainingEffort?: number
  [key: string]: unknown
}

function mapStatus(raw: RawFactroPackage): TaskStatus {
  // Factro packages have no explicit status field — infer from effort data
  if (raw.realizedEffort != null && raw.plannedEffort != null && raw.plannedEffort > 0) {
    if (raw.realizedEffort >= raw.plannedEffort) return 'closed'
  }
  return 'open'
}

export function transformTask(raw: RawFactroPackage, projectId?: string): Task {
  return {
    id: raw.id,
    externalId: raw.id,
    projectId: projectId ?? pickStr(raw.projectId) ?? '',
    parentId: pickStr(raw.parentPackageId),
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: undefined,
    dueDate: toIso(raw.endDate),
    assigneeIds: raw.officerId ? [raw.officerId] : [],
    tagIds: [],
    subtaskCount: undefined,
    createdAt: toIso(raw.creationDate),
    updatedAt: toIso(raw.changeDate),
    platform: 'factro',
    metadata: strMap({
      number: raw.number,
      plannedEffort: raw.plannedEffort,
      realizedEffort: raw.realizedEffort,
      remainingEffort: raw.remainingEffort,
      companyId: raw.companyId,
    }),
    raw,
  }
}
