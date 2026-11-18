import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * A Stackby row as returned by `GET /rowlist/{stackId}/{tableName}`.
 *
 * Each row contains a `rowId` (internal Stackby identifier) and a `field`
 * object whose keys are the table's column names and whose values are the
 * cell contents (string or null). Column names are user-defined, so we
 * look for common names case-insensitively to map canonical fields.
 */
export interface RawStackbyRow {
  rowId: string
  field: Record<string, unknown>
  [key: string]: unknown
}

/** Finds a value in the `field` map by trying common case variants. */
function getField(field: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const lower = key.toLowerCase()
    for (const [k, v] of Object.entries(field)) {
      if (k.toLowerCase() === lower) return v
    }
  }
  return undefined
}

function mapStatus(field: Record<string, unknown>): TaskStatus {
  const raw = getField(field, 'Status', 'State', 'Stage', 'Progress')
  if (raw == null) return 'open'
  const v = String(raw).toLowerCase()
  if (v === 'done' || v === 'completed' || v === 'closed' || v === 'complete') return 'closed'
  if (v === 'in progress' || v === 'in_progress' || v === 'wip' || v === 'doing') return 'in_progress'
  if (v === 'blocked' || v === 'on hold' || v === 'on_hold') return 'on_hold'
  return 'open'
}

function mapPriority(field: Record<string, unknown>): TaskPriority | undefined {
  const raw = getField(field, 'Priority', 'Urgency', 'Importance')
  if (raw == null) return undefined
  const v = String(raw).toLowerCase()
  if (v === 'urgent' || v === 'critical') return 'urgent'
  if (v === 'high') return 'high'
  if (v === 'medium' || v === 'normal' || v === 'moderate') return 'medium'
  if (v === 'low') return 'low'
  return undefined
}

export function transformTask(raw: RawStackbyRow, projectId: string): Task {
  const field = raw.field ?? {}
  const title =
    pickStr(getField(field, 'Name', 'Title', 'Task', 'Task Name', 'Row Name', 'Summary')) ?? ''
  const description = pickStr(getField(field, 'Description', 'Notes', 'Details', 'Body'))
  const dueDate = toIso(getField(field, 'Due Date', 'Due', 'Deadline', 'End Date'))
  const createdAt = toIso(getField(field, 'Created', 'Created At', 'Created Date', 'Date Created'))
  const updatedAt = toIso(getField(field, 'Updated', 'Updated At', 'Modified', 'Last Modified'))

  // Assignee column typically holds a name string or a comma-separated list
  const assigneeRaw = getField(field, 'Assignee', 'Assigned To', 'Owner', 'Assigned')
  const assigneeIds: string[] = []
  if (assigneeRaw != null && String(assigneeRaw).trim() !== '') {
    assigneeIds.push(String(assigneeRaw).trim())
  }

  // Capture all column names + values as metadata for discoverability
  const metaEntries: Record<string, string> = {}
  for (const [k, v] of Object.entries(field)) {
    if (v === null || v === undefined) continue
    if (typeof v !== 'object') {
      metaEntries[k] = String(v)
    }
  }

  return {
    id: raw.rowId,
    externalId: raw.rowId,
    projectId,
    title,
    description,
    status: mapStatus(field),
    priority: mapPriority(field),
    dueDate,
    assigneeIds,
    tagIds: [],
    createdAt,
    updatedAt,
    platform: 'stackby',
    metadata: strMap(metaEntries),
    raw,
  }
}
