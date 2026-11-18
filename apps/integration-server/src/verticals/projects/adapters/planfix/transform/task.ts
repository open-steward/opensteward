import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import {
  pickStr,
  strMap,
  timePointToIso,
  personId,
  peopleUserIds,
  type PlanfixTimePoint,
  type PlanfixPerson,
  type PlanfixPeople,
} from './shared'

/**
 * Planfix task (`TaskResponse`). The numeric `id` is the canonical id; the
 * `status` is a nested object whose `name` carries the human label (Planfix
 * statuses are account-configurable, so we classify by name keyword and fall
 * back to `unknown`). `priority` is a plain string. People come back as a
 * namespaced string id (`"user:42"`).
 */
export interface RawPlanfixTask {
  id: number
  name?: string
  description?: string
  priority?: string
  status?: { id?: number; name?: string; color?: string } | null
  type?: string
  assigner?: PlanfixPerson | null
  parent?: { id?: number } | null
  project?: { id?: number } | null
  counterparty?: PlanfixPerson | null
  dateTime?: PlanfixTimePoint | null
  startDateTime?: PlanfixTimePoint | null
  endDateTime?: PlanfixTimePoint | null
  dateOfLastUpdate?: PlanfixTimePoint | null
  overdue?: boolean
  closeToDeadLine?: boolean
  assignees?: PlanfixPeople | null
  [key: string]: unknown
}

function mapStatus(raw: RawPlanfixTask): TaskStatus {
  const name = (raw.status?.name ?? '').toLowerCase()
  if (!name) return 'open'
  if (name.includes('cancel') || name.includes('reject') || name.includes('declin')) return 'cancelled'
  if (name.includes('done') || name.includes('complet') || name.includes('closed') || name.includes('finish'))
    return 'closed'
  if (name.includes('review') || name.includes('check') || name.includes('approv')) return 'in_review'
  if (name.includes('progress') || name.includes('work') || name.includes('doing')) return 'in_progress'
  if (name.includes('new') || name.includes('open') || name.includes('todo') || name.includes('backlog'))
    return 'open'
  return 'unknown'
}

function mapPriority(raw: RawPlanfixTask): TaskPriority | undefined {
  const v = (raw.priority ?? '').toLowerCase()
  if (!v) return undefined
  if (v.includes('urgent') || v.includes('critical') || v.includes('highest')) return 'urgent'
  if (v.includes('high')) return 'high'
  if (v.includes('medium') || v.includes('normal')) return 'medium'
  if (v.includes('low') || v.includes('minor')) return 'low'
  return undefined
}

export function transformTask(raw: RawPlanfixTask, projectId?: string): Task {
  const pid = projectId ?? (raw.project?.id != null ? String(raw.project.id) : '')
  const parentId = raw.parent?.id != null ? String(raw.parent.id) : undefined
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    projectId: pid,
    parentId,
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: timePointToIso(raw.endDateTime),
    assigneeIds: peopleUserIds(raw.assignees),
    tagIds: [],
    createdAt: timePointToIso(raw.dateTime),
    updatedAt: timePointToIso(raw.dateOfLastUpdate),
    platform: 'planfix',
    metadata: strMap({
      platformType: parentId ? 'subtask' : 'task',
      type: raw.type,
      statusName: raw.status?.name,
      statusId: raw.status?.id,
      assignerId: personId(raw.assigner),
      counterpartyId: personId(raw.counterparty),
      overdue: raw.overdue,
      closeToDeadline: raw.closeToDeadLine,
    }),
    raw,
  }
}
