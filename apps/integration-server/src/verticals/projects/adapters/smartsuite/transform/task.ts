/**
 * SmartSuite records map to canonical Tasks.
 *
 * Records are fetched via POST /api/v1/applications/{tableId}/records/list/
 * and GET /api/v1/applications/{tableId}/records/{recordId}/
 *
 * The record shape depends on the table structure. SmartSuite has well-known
 * system fields (title, description, assigned_to, status, due_date, priority,
 * first_created, last_updated, comments_count) plus user-defined fields.
 */
import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawSmartsuiteDate {
  from_date?: string | null
  to_date?: string | null
  is_overdue?: boolean
}

export interface RawSmartsuiteStatus {
  value?: string | null
}

export interface RawSmartsuiteTimestamp {
  on?: string | null
  by?: string | null
}

export interface RawSmartsuiteRecord {
  id: string
  /** Primary title field */
  title?: string | null
  /** Rich-text description */
  description?: { data?: unknown; html?: string } | null
  /** Array of member/user IDs */
  assigned_to?: string[]
  status?: RawSmartsuiteStatus | null
  due_date?: RawSmartsuiteDate | null
  /** SmartSuite priority stored as a string value */
  priority?: string | null
  first_created?: RawSmartsuiteTimestamp | null
  last_updated?: RawSmartsuiteTimestamp | null
  comments_count?: number
  /** autonumber field */
  autonumber?: number
  [key: string]: unknown
}

function mapStatus(raw: RawSmartsuiteRecord): TaskStatus {
  const v = (raw.status?.value ?? '').toLowerCase()
  if (v === 'complete' || v === 'completed' || v === 'done' || v === 'closed') return 'closed'
  if (v === 'cancelled' || v === 'canceled') return 'cancelled'
  if (v === 'in progress' || v === 'in_progress' || v === 'active') return 'in_progress'
  if (v === 'in review' || v === 'in_review' || v === 'review') return 'in_review'
  return 'open'
}

function mapPriority(raw: RawSmartsuiteRecord): TaskPriority | undefined {
  const v = (raw.priority ?? '').toLowerCase()
  if (v === 'urgent' || v === 'critical') return 'urgent'
  if (v === 'high') return 'high'
  if (v === 'medium' || v === 'normal' || v === 'moderate') return 'medium'
  if (v === 'low') return 'low'
  return undefined
}

export function transformTask(raw: RawSmartsuiteRecord, tableId?: string): Task {
  const dueDate = raw.due_date?.from_date ?? raw.due_date?.to_date ?? undefined
  const description = raw.description?.html ?? undefined
  return {
    id: raw.id,
    externalId: raw.id,
    projectId: tableId ?? '',
    title: pickStr(raw.title) ?? '',
    description: pickStr(description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(dueDate),
    assigneeIds: Array.isArray(raw.assigned_to) ? raw.assigned_to.filter(Boolean) : [],
    tagIds: [],
    subtaskCount: undefined,
    createdAt: toIso(raw.first_created?.on),
    updatedAt: toIso(raw.last_updated?.on),
    platform: 'smartsuite',
    metadata: strMap({
      commentsCount: raw.comments_count,
      autonumber: raw.autonumber,
      statusValue: raw.status?.value,
    }),
    raw,
  }
}
