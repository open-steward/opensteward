/**
 * SmartTask task transform.
 *
 * POST /task/create-task/{organization_id} and related endpoints return:
 * {
 *   record_id: string (uuid),
 *   organization_id: number,
 *   name: string,
 *   description: string,
 *   assigned_user: { user_id, full_name, email, avatar_url, timezone_in_mins },
 *   followers: [...],
 *   priority: string ("high", "medium", "low", ""),
 *   date_info: { start_date, due_date, ... },
 *   status: number (0=incomplete, 1=complete),
 *   completed_at: string | null,
 *   estimated_time: number,
 *   billable: boolean,
 *   projects: [{ ProjectId, Name }],
 * }
 */
import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawSmarttaskTask {
  record_id: string
  organization_id?: number | string
  name?: string
  description?: string
  assigned_user?: { user_id?: number | string; full_name?: string; email?: string } | null
  followers?: Array<{ user_id?: number | string }>
  priority?: string
  date_info?: { start_date?: string; due_date?: string } | null
  /** 0 = incomplete, 1 = complete */
  status?: number
  completed_at?: string | null
  estimated_time?: number
  billable?: boolean
  projects?: Array<{ ProjectId?: string; Name?: string }>
  [key: string]: unknown
}

function mapStatus(raw: RawSmarttaskTask): TaskStatus {
  if (raw.status === 1) return 'closed'
  return 'open'
}

function mapPriority(raw: RawSmarttaskTask): TaskPriority | undefined {
  const v = (raw.priority ?? '').toLowerCase()
  if (v === 'urgent' || v === 'critical') return 'urgent'
  if (v === 'high') return 'high'
  if (v === 'medium' || v === 'normal') return 'medium'
  if (v === 'low') return 'low'
  return undefined
}

export function transformTask(raw: RawSmarttaskTask, projectId?: string): Task {
  const pid = projectId ?? raw.projects?.[0]?.ProjectId ?? ''
  const assigneeId = raw.assigned_user?.user_id != null
    ? String(raw.assigned_user.user_id)
    : undefined
  return {
    id: raw.record_id,
    externalId: raw.record_id,
    projectId: pid,
    parentId: undefined,
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.date_info?.due_date),
    assigneeIds: assigneeId ? [assigneeId] : [],
    tagIds: [],
    subtaskCount: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    platform: 'smarttask',
    metadata: strMap({
      estimatedTime: raw.estimated_time,
      billable: raw.billable,
      organizationId: raw.organization_id,
    }),
    raw,
  }
}
