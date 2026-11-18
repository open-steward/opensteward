/**
 * SeaTable row → canonical Task.
 *
 * In SeaTable, a "row" inside a base table is the closest analogue to a task.
 * The `GET /api-gateway/api/v2/dtables/{base_uuid}/rows/` endpoint returns row
 * objects whose user-defined columns vary per base schema. We map the well-known
 * system fields and make a best-effort mapping for common column names.
 *
 * System fields present on every row:
 *   _id          — 22-char row identifier
 *   _ctime       — ISO-8601 creation time
 *   _mtime       — ISO-8601 modification time
 *   _creator     — email of creator
 *   _last_modifier — email of last modifier
 *
 * User-defined columns (best-effort, case-insensitive lookup):
 *   Name / Title / Task        → title
 *   Description / Notes / Desc → description
 *   Status / State             → status
 *   Priority / Prio            → priority
 *   Due Date / Due / Deadline  → dueDate
 *   Assignee / Assigned To     → assigneeIds (collaborator column)
 */
import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawSeatableRow {
  _id: string
  _ctime?: string
  _mtime?: string
  _creator?: string
  _last_modifier?: string
  [key: string]: unknown
}

/** Case-insensitive search for a value among common column name variants. */
function pickCol(raw: RawSeatableRow, ...keys: string[]): unknown {
  const entries = Object.entries(raw)
  for (const key of keys) {
    const lower = key.toLowerCase()
    const found = entries.find(([k]) => k.toLowerCase() === lower)
    if (found !== undefined && found[1] !== undefined && found[1] !== null) return found[1]
  }
  return undefined
}

function mapStatus(raw: RawSeatableRow): TaskStatus {
  const s = String(pickCol(raw, 'Status', 'State', 'status', 'state') ?? '').toLowerCase()
  if (s === 'done' || s === 'closed' || s === 'complete' || s === 'completed' || s === 'finished') {
    return 'closed'
  }
  if (s === 'in progress' || s === 'in_progress' || s === 'wip' || s === 'doing') {
    return 'in_progress'
  }
  return 'open'
}

function mapPriority(raw: RawSeatableRow): TaskPriority | undefined {
  const v = String(pickCol(raw, 'Priority', 'Prio', 'priority', 'prio') ?? '').toLowerCase()
  if (v === 'urgent' || v === 'critical') return 'urgent'
  if (v === 'high') return 'high'
  if (v === 'medium' || v === 'normal' || v === 'mid') return 'medium'
  if (v === 'low') return 'low'
  return undefined
}

function extractAssigneeIds(raw: RawSeatableRow): string[] {
  const col = pickCol(raw, 'Assignee', 'Assigned To', 'Assignees', 'assignee', 'assigned_to')
  if (!col) return []
  // Collaborator column returns an array of email strings
  if (Array.isArray(col)) return col.map(String).filter(Boolean)
  if (typeof col === 'string' && col) return [col]
  return []
}

function extractTitle(raw: RawSeatableRow): string {
  const v = pickCol(raw, 'Name', 'Title', 'Task', 'name', 'title', 'task')
  return pickStr(v) ?? raw._id
}

function extractDescription(raw: RawSeatableRow): string | undefined {
  return pickStr(pickCol(raw, 'Description', 'Notes', 'Desc', 'description', 'notes', 'desc'))
}

function extractDueDate(raw: RawSeatableRow): string | undefined {
  return toIso(pickCol(raw, 'Due Date', 'Due', 'Deadline', 'due_date', 'due', 'deadline'))
}

export function transformTask(raw: RawSeatableRow, projectId?: string): Task {
  return {
    id: raw._id,
    externalId: raw._id,
    projectId: projectId ?? '',
    parentId: undefined,
    title: extractTitle(raw),
    description: extractDescription(raw),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: extractDueDate(raw),
    assigneeIds: extractAssigneeIds(raw),
    tagIds: [],
    subtaskCount: undefined,
    createdAt: toIso(raw._ctime),
    updatedAt: toIso(raw._mtime),
    platform: 'seatable',
    metadata: strMap({
      creator: raw._creator,
      lastModifier: raw._last_modifier,
    }),
    raw,
  }
}
