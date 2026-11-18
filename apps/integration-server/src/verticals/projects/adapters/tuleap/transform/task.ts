import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { strMap, toIso } from './shared'

/**
 * Tuleap artifact object returned by GET /api/trackers/{id}/artifacts and
 * GET /api/artifacts/{id}.
 *
 * Artifacts are the Tuleap equivalent of tasks/issues. They belong to a
 * tracker (which lives inside a project).
 *
 * Relevant fields:
 *   id               - numeric artifact identifier
 *   uri              - e.g. "artifacts/1433"
 *   tracker          - { id, uri, label, item_name, project: { id } }
 *   submitted_by     - numeric user ID
 *   submitted_on     - ISO-8601 creation timestamp
 *   last_update_date - ISO-8601 last-modified timestamp
 *   html_url         - link to artifact in the web UI
 *   changesets_uri   - URI for changesets/comments
 *   values           - array of { field_id, label, type, value }
 *   values_by_field  - map of shortname → { field_id, label, value }
 *
 * Field values are dynamic. We extract common semantic fields from
 * `values_by_field` when present, then fall back to `values` by label.
 */
export interface RawTuleapArtifactValue {
  field_id?: number
  label?: string
  type?: string
  value?: unknown
  bind_value_ids?: number[]
  values?: Array<{ id: number; label?: string }>
  [key: string]: unknown
}

export interface RawTuleapArtifact {
  id: number
  uri?: string
  tracker?: {
    id?: number
    uri?: string
    label?: string
    item_name?: string
    project?: { id?: number; uri?: string; label?: string }
  }
  submitted_by?: number
  submitted_on?: string
  last_update_date?: string
  html_url?: string
  changesets_uri?: string
  values?: RawTuleapArtifactValue[]
  values_by_field?: Record<string, RawTuleapArtifactValue>
  [key: string]: unknown
}

/** Extract a string value from values_by_field or values by candidate labels. */
function extractValue(raw: RawTuleapArtifact, ...candidates: string[]): string | undefined {
  const byField = raw.values_by_field
  if (byField) {
    for (const c of candidates) {
      const entry = byField[c]
      if (!entry) continue
      const v = entry.value
      if (typeof v === 'string' && v) return v
      if (typeof v === 'number') return String(v)
      // list/select-box: first label
      const items = (entry.values ?? []) as Array<{ label?: string }>
      if (items.length > 0 && items[0]?.label) return items[0].label
    }
  }
  // fall back to values array
  const vals = raw.values ?? []
  for (const v of vals) {
    const lc = (v.label ?? '').toLowerCase()
    for (const c of candidates) {
      if (lc === c.toLowerCase()) {
        if (typeof v.value === 'string' && v.value) return v.value
        if (typeof v.value === 'number') return String(v.value)
        const items = (v.values ?? []) as Array<{ label?: string }>
        if (items.length > 0 && items[0]?.label) return items[0].label
      }
    }
  }
  return undefined
}

/** Extract a user ID from a user-type field value. */
function extractUserId(raw: RawTuleapArtifact, ...candidates: string[]): string | undefined {
  const byField = raw.values_by_field
  if (byField) {
    for (const c of candidates) {
      const entry = byField[c]
      if (!entry) continue
      const v = entry.value as { id?: number } | undefined
      if (v?.id != null) return String(v.id)
    }
  }
  const vals = raw.values ?? []
  for (const v of vals) {
    const lc = (v.label ?? '').toLowerCase()
    for (const c of candidates) {
      if (lc === c.toLowerCase()) {
        const u = v.value as { id?: number } | undefined
        if (u?.id != null) return String(u.id)
      }
    }
  }
  return undefined
}

function mapStatus(raw: RawTuleapArtifact): TaskStatus {
  const statusVal = (
    extractValue(raw, 'status', 'Status', 'Statut', 'état') ?? ''
  ).toLowerCase()
  if (
    statusVal === 'closed' ||
    statusVal === 'done' ||
    statusVal === 'resolved' ||
    statusVal === 'fixed' ||
    statusVal === 'rejected' ||
    statusVal === 'won\'t fix' ||
    statusVal === 'invalid'
  )
    return 'closed'
  if (
    statusVal === 'in progress' ||
    statusVal === 'in_progress' ||
    statusVal === 'ongoing' ||
    statusVal === 'en cours'
  )
    return 'in_progress'
  return 'open'
}

function mapPriority(raw: RawTuleapArtifact): TaskPriority | undefined {
  const p = (extractValue(raw, 'priority', 'Priority', 'Priorité') ?? '').toLowerCase()
  if (p === 'critical' || p === 'blocker') return 'urgent'
  if (p === 'major' || p === 'high') return 'high'
  if (p === 'normal' || p === 'medium' || p === 'moderate') return 'medium'
  if (p === 'minor' || p === 'low') return 'low'
  return undefined
}

export function transformArtifact(raw: RawTuleapArtifact, projectId?: string): Task {
  const id = String(raw.id ?? '')
  const pid =
    projectId ??
    (raw.tracker?.project?.id != null ? String(raw.tracker.project.id) : '')

  const assigneeId = extractUserId(raw, 'assigned_to', 'assignee', 'Assigned to', 'assignee_id')
  const title = extractValue(raw, 'summary', 'title', 'Title', 'Summary', 'subject', 'name') ?? ''
  const description = extractValue(raw, 'details', 'description', 'Description', 'content')
  const dueDate = toIso(extractValue(raw, 'due_date', 'close_date', 'end_date', 'Due Date'))

  return {
    id,
    externalId: id,
    projectId: pid,
    parentId: undefined,
    title,
    description,
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate,
    assigneeIds: assigneeId ? [assigneeId] : [],
    tagIds: [],
    subtaskCount: undefined,
    createdAt: toIso(raw.submitted_on),
    updatedAt: toIso(raw.last_update_date),
    platform: 'tuleap',
    metadata: strMap({
      trackerId: raw.tracker?.id,
      trackerLabel: raw.tracker?.label,
      trackerItemName: raw.tracker?.item_name,
      submittedBy: raw.submitted_by,
      htmlUrl: raw.html_url,
    }),
    raw,
  }
}
