/**
 * Transform a Leantime ticket (task) API object into the canonical Task schema.
 *
 * Leantime ticket model fields (Tickets model class):
 *   id, headline (title), description, type, projectId,
 *   editorId (assignee), userId (creator), priority (numeric 1-4),
 *   status (numeric), date (created), dateToFinish (due date),
 *   milestoneid, tags, storypoints, planHours, hourRemaining,
 *   acceptanceCriteria, modified
 *
 * Priority mapping (Leantime numeric values):
 *   3 = urgent, 2 = high, 0 = medium/normal, 1 = low
 *
 * Status labels come from the project's status configuration.
 * A status of 0 typically means "open"; Leantime calls 98 "reviewing" and
 * higher values indicate done.
 */
import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, pickNum, strMap, toIso } from './shared'

export interface RawLeantimeTicket {
  id?: number | string
  headline?: string
  description?: string
  type?: string
  projectId?: number | string
  editorId?: number | string
  userId?: number | string
  priority?: number | string
  status?: number | string
  statusLabel?: string
  date?: string
  dateToFinish?: string
  modified?: string
  milestoneid?: number | string
  tags?: string
  storypoints?: number | string
  planHours?: number | string
  hourRemaining?: number | string
  acceptanceCriteria?: string
  [key: string]: unknown
}

function mapStatus(raw: RawLeantimeTicket): TaskStatus {
  const s = pickNum(raw.status) ?? 0
  // Leantime has configurable statuses. Treat 0 as open. Non-zero values that
  // the label says "done" or status >= 98 are treated as closed.
  const label = (raw.statusLabel ?? '').toLowerCase()
  if (label === 'done' || label === 'closed' || label === 'completed') return 'closed'
  if (s >= 98) return 'closed'
  if (label === 'in progress' || label === 'in_progress' || label === 'in-progress') return 'in_progress'
  if (label === 'review' || label === 'reviewing' || label === 'in review') return 'in_review'
  if (s === 0) return 'open'
  return 'open'
}

function mapPriority(raw: RawLeantimeTicket): TaskPriority | undefined {
  const p = pickNum(raw.priority)
  if (p === null || p === undefined) return undefined
  // Leantime numeric priority: 3=urgent, 2=high, 0=medium, 1=low
  if (p === 3) return 'urgent'
  if (p === 2) return 'high'
  if (p === 0) return 'medium'
  if (p === 1) return 'low'
  return undefined
}

export function transformTicket(raw: RawLeantimeTicket, projectId?: string): Task {
  const id = String(raw.id ?? '')
  const pid = projectId ?? (raw.projectId != null ? String(raw.projectId) : '')
  const editorId = raw.editorId != null ? String(raw.editorId) : undefined
  return {
    id,
    externalId: id,
    projectId: pid,
    parentId: raw.milestoneid != null ? String(raw.milestoneid) : undefined,
    title: pickStr(raw.headline) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.dateToFinish),
    assigneeIds: editorId ? [editorId] : [],
    tagIds: [],
    createdAt: toIso(raw.date),
    updatedAt: toIso(raw.modified),
    platform: 'leantime',
    metadata: strMap({
      type: raw.type,
      statusLabel: raw.statusLabel,
      storypoints: raw.storypoints,
      planHours: raw.planHours,
      hourRemaining: raw.hourRemaining,
      tags: raw.tags,
      userId: raw.userId,
    }),
    raw,
  }
}
