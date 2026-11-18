/**
 * Taiga task transform.
 *
 * Taiga has three task-like resource types mapped to the canonical Task:
 *   - User Story  (/userstories)  — primary unit of work
 *   - Task        (/tasks)        — sub-unit linked to a user story
 *   - Issue       (/issues)       — bug/enhancement tracker
 *
 * All three share the same canonical Task schema. The `metadata.resourceType`
 * field distinguishes them at read time.
 *
 * Priority mapping (Taiga issue priorities — user stories have no native
 * priority, tasks inherit from their user story; issues use priority object):
 *   low → low, normal → medium, high → high, critical/blocker → urgent
 */
import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTaigaTask {
  id: number
  ref?: number
  subject?: string
  description?: string
  is_closed?: boolean
  status?: { id?: number; name?: string } | null
  project?: number
  user_story?: number | null
  assigned_to?: number | null
  assigned_to_extra_info?: { id?: number } | null
  owner?: number | null
  /** `[name, color]` pairs; the color slot is null for uncolored tags (see `tag.ts`). */
  tags?: Array<Array<string | null>>
  due_date?: string | null
  finish_date?: string | null
  created_date?: string
  modified_date?: string
  priority?: { name?: string } | null
  severity?: { name?: string } | null
  /** Issue-level priority name (issues only) */
  priority_extra_info?: { name?: string } | null
  /** 'userstory' | 'task' | 'issue' */
  _resourceType?: string
  [key: string]: unknown
}

function mapStatus(raw: RawTaigaTask): TaskStatus {
  if (raw.is_closed) return 'closed'
  const statusName = (raw.status?.name ?? '').toLowerCase()
  if (statusName.includes('progress') || statusName.includes('doing')) return 'in_progress'
  if (statusName.includes('done') || statusName.includes('closed')) return 'closed'
  return 'open'
}

function mapPriority(raw: RawTaigaTask): TaskPriority | undefined {
  const name = (raw.priority?.name ?? raw.priority_extra_info?.name ?? '').toLowerCase()
  if (!name) return undefined
  if (name === 'critical' || name === 'blocker') return 'urgent'
  if (name === 'high') return 'high'
  if (name === 'normal') return 'medium'
  if (name === 'low') return 'low'
  return undefined
}

export function transformTask(raw: RawTaigaTask, projectId?: string, resourceType = 'task'): Task {
  const pid = projectId ?? (raw.project != null ? String(raw.project) : '')
  const assigneeId =
    raw.assigned_to != null
      ? String(raw.assigned_to)
      : raw.assigned_to_extra_info?.id != null
        ? String(raw.assigned_to_extra_info.id)
        : null
  // tags: Taiga returns tags as arrays [name, color] or plain strings
  const tagIds = (raw.tags ?? []).map((t) =>
    Array.isArray(t) ? String(t[0] ?? '') : String(t),
  )
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    projectId: pid,
    parentId: raw.user_story != null ? String(raw.user_story) : undefined,
    title: pickStr(raw.subject) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.due_date ?? raw.finish_date),
    assigneeIds: assigneeId ? [assigneeId] : [],
    tagIds,
    subtaskCount: undefined,
    createdAt: toIso(raw.created_date),
    updatedAt: toIso(raw.modified_date),
    platform: 'taiga',
    metadata: strMap({
      resourceType,
      ref: raw.ref,
      statusName: raw.status?.name,
    }),
    raw,
  }
}
