/**
 * Transform a Zoho BugTracker bug into the canonical Task shape.
 *
 * Bugs are the primary "task" resource in Zoho BugTracker.
 * GET /restapi/portal/[PORTALID]/projects/[PROJECTID]/bugs/
 * GET /restapi/portal/[PORTALID]/projects/[PROJECTID]/bugs/[BUGID]/
 * Docs: https://www.zoho.com/projects/help/rest-api/bugtracker-bugs-api.html
 */
import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawZohoBugtrackerBug {
  id: string | number
  id_string?: string
  key?: string
  title?: string
  description?: string
  status?: { name?: string; id?: string | number }
  severity?: { name?: string; id?: string | number }
  classification?: { name?: string }
  flag?: string
  closed?: boolean
  due_date?: string
  due_date_long?: number
  created_time?: string
  created_time_long?: number
  last_modified_time?: string
  last_modified_time_long?: number
  assignee?: Array<{ name?: string; id?: string | number }>
  reporter_id?: string | number
  reported_person?: string
  module?: { id?: string | number; name?: string }
  customfields?: Array<{ label_name?: string; value?: string; column_name?: string }>
  [key: string]: unknown
}

function mapStatus(raw: RawZohoBugtrackerBug): TaskStatus {
  if (raw.closed) return 'closed'
  const name = (raw.status?.name ?? '').toLowerCase()
  if (name === 'closed' || name === 'fixed' || name === 'resolved' || name === 'completed') {
    return 'closed'
  }
  if (name === 'in progress' || name === 'in_progress' || name === 'open') return 'open'
  return 'open'
}

function mapPriority(raw: RawZohoBugtrackerBug): TaskPriority | undefined {
  const sev = (raw.severity?.name ?? '').toLowerCase()
  if (sev === 'critical' || sev === 'blocker') return 'urgent'
  if (sev === 'high' || sev === 'major') return 'high'
  if (sev === 'medium' || sev === 'normal' || sev === 'minor') return 'medium'
  if (sev === 'low' || sev === 'trivial') return 'low'
  // Fall back to custom field named "priority" if present
  const pField = raw.customfields?.find(
    (f) => (f.label_name ?? f.column_name ?? '').toLowerCase() === 'priority',
  )
  if (pField?.value) {
    const v = pField.value.toLowerCase()
    if (v === 'urgent' || v === 'critical') return 'urgent'
    if (v === 'high') return 'high'
    if (v === 'medium' || v === 'normal') return 'medium'
    if (v === 'low') return 'low'
  }
  return undefined
}

export function transformTask(raw: RawZohoBugtrackerBug, projectId?: string): Task {
  const id = pickStr(raw.id_string) ?? String(raw.id)
  const assigneeIds = (raw.assignee ?? [])
    .map((a) => (a.id != null ? String(a.id) : undefined))
    .filter((a): a is string => a !== undefined)
  return {
    id,
    externalId: id,
    projectId: projectId ?? '',
    parentId: undefined,
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.due_date_long ?? raw.due_date),
    assigneeIds,
    tagIds: [],
    createdAt: toIso(raw.created_time_long ?? raw.created_time),
    updatedAt: toIso(raw.last_modified_time_long ?? raw.last_modified_time),
    platform: 'zoho-bugtracker',
    metadata: strMap({
      bugKey: raw.key,
      statusName: raw.status?.name,
      severityName: raw.severity?.name,
      classificationName: raw.classification?.name,
      flag: raw.flag,
      reportedPerson: raw.reported_person,
      moduleName: raw.module?.name,
    }),
    raw,
  }
}
