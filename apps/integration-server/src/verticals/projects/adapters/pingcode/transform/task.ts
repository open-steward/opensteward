import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * PingCode work item (`GET /v1/agile/work_items`). A work item is one of
 * epic / feature / story / task / bug / issue — PingCode's flat-with-parent
 * hierarchy maps cleanly onto the canonical Task (`parentId` chain, the
 * concrete level lives in `metadata.platformType`).
 *
 * `state` is an object carrying its workflow `type` (unstarted/started/
 * completed/…) which drives canonical status. `assignee` is a user id (the
 * open API sometimes nests it as `{ id }`). Timestamps are epoch seconds.
 */
export interface RawPingcodeWorkItem {
  id: string
  identifier?: string
  title?: string
  description?: string
  type?: string
  project_id?: string
  parent_id?: string | null
  state?: { id?: string; name?: string; type?: string } | null
  assignee?: { id?: string } | string | null
  priority?: { id?: string; name?: string; value?: number } | string | null
  sprint_id?: string | null
  due_date?: number | string | null
  created_at?: number | string
  updated_at?: number | string
  created_by?: string
  [key: string]: unknown
}

function assigneeId(raw: RawPingcodeWorkItem): string | undefined {
  const a = raw.assignee
  if (typeof a === 'string') return pickStr(a)
  if (a && typeof a === 'object') return pickStr(a.id)
  return undefined
}

function priorityName(raw: RawPingcodeWorkItem): string | undefined {
  const p = raw.priority
  if (typeof p === 'string') return p
  if (p && typeof p === 'object') return pickStr(p.name)
  return undefined
}

/** Map a PingCode workflow-state `type` onto the canonical task status. */
function mapStatus(raw: RawPingcodeWorkItem): TaskStatus {
  switch ((raw.state?.type ?? '').toLowerCase()) {
    case 'unstarted':
    case 'pending':
      return 'open'
    case 'started':
    case 'in_progress':
      return 'in_progress'
    case 'completed':
    case 'done':
      return 'closed'
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    default:
      return 'open'
  }
}

function mapPriority(raw: RawPingcodeWorkItem): TaskPriority | undefined {
  const v = (priorityName(raw) ?? '').toLowerCase()
  if (v === 'urgent' || v === 'critical' || v === 'highest') return 'urgent'
  if (v === 'high') return 'high'
  if (v === 'medium' || v === 'normal') return 'medium'
  if (v === 'low' || v === 'lowest') return 'low'
  return undefined
}

export function transformTask(raw: RawPingcodeWorkItem, projectId?: string): Task {
  const assignee = assigneeId(raw)
  return {
    id: raw.id,
    externalId: raw.id,
    projectId: projectId ?? pickStr(raw.project_id) ?? '',
    parentId: pickStr(raw.parent_id),
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.due_date),
    assigneeIds: assignee ? [assignee] : [],
    tagIds: [],
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'pingcode',
    metadata: strMap({
      platformType: raw.type,
      identifier: raw.identifier,
      stateId: raw.state?.id,
      stateName: raw.state?.name,
      sprintId: raw.sprint_id,
    }),
    raw,
  }
}
