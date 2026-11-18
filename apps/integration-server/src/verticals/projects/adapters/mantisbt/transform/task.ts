/**
 * MantisBT issue → canonical Task transform.
 *
 * MantisBT uses the term "issue" for what the canonical schema calls a "task".
 * Issues are fetched from GET /issues?project_id=&page=&page_size= and
 * GET /issues/{id}.
 *
 * Key response fields:
 *   id, summary, description, project: {id, name}, category: {id, name},
 *   status: {id, name, label}, priority: {id, name, label},
 *   severity: {id, name, label}, handler: {id, name, real_name, email},
 *   reporter: {id, name, real_name, email},
 *   tags: [{id, name}], created_at, updated_at, due_date,
 *   target_version: {id, name}
 */
import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

interface EnumRef {
  id?: number
  name?: string
  label?: string
  [key: string]: unknown
}

interface AccountRef {
  id?: number
  name?: string
  real_name?: string
  email?: string
  [key: string]: unknown
}

interface TagRef {
  id?: number
  name?: string
  [key: string]: unknown
}

export interface RawMantisbtIssue {
  id?: number
  summary?: string
  description?: string
  project?: { id?: number; name?: string } | null
  category?: { id?: number; name?: string } | null
  status?: EnumRef | null
  priority?: EnumRef | null
  severity?: EnumRef | null
  resolution?: EnumRef | null
  handler?: AccountRef | null
  reporter?: AccountRef | null
  tags?: TagRef[]
  created_at?: string
  updated_at?: string
  due_date?: string
  [key: string]: unknown
}

function mapStatus(raw: RawMantisbtIssue): TaskStatus {
  const name = (raw.status?.name ?? '').toLowerCase()
  if (name === 'resolved' || name === 'closed') return 'closed'
  if (name === 'new' || name === 'feedback' || name === 'acknowledged' || name === 'confirmed' || name === 'assigned') return 'open'
  return 'open'
}

function mapPriority(raw: RawMantisbtIssue): TaskPriority | undefined {
  const name = (raw.priority?.name ?? '').toLowerCase()
  if (name === 'urgent' || name === 'immediate') return 'urgent'
  if (name === 'high') return 'high'
  if (name === 'normal' || name === 'medium') return 'medium'
  if (name === 'low' || name === 'none') return 'low'
  return undefined
}

export function transformIssue(raw: RawMantisbtIssue, projectId?: string): Task {
  const id = String(raw.id ?? '')
  const pid = projectId ?? String(raw.project?.id ?? '')
  const handlerId = raw.handler?.id != null ? String(raw.handler.id) : undefined
  const tagIds = (raw.tags ?? []).map((t) => String(t.id ?? '')).filter(Boolean)
  return {
    id,
    externalId: id,
    projectId: pid,
    parentId: undefined,
    title: pickStr(raw.summary) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.due_date),
    assigneeIds: handlerId ? [handlerId] : [],
    tagIds,
    subtaskCount: undefined,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'mantisbt',
    metadata: strMap({
      statusLabel: raw.status?.label,
      severityName: raw.severity?.name,
      resolutionName: raw.resolution?.name,
      categoryName: raw.category?.name,
    }),
    raw,
  }
}
