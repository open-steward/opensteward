import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Procore RFI (Request For Information) — the closest project-scoped unit of
 * work in Procore, mapped onto the canonical Task. Returned by
 * `GET /rest/v1.0/projects/{project_id}/rfis`. RFIs are flat (no parent
 * pointer), so `parentId` is never set. The question text lives either on a
 * top-level `body`/`question` or on the first entry of the `questions` array.
 */
export interface RawProcoreRfi {
  id: number | string
  subject?: string
  number?: string
  full_number?: string
  status?: string
  priority?: string
  body?: string
  question?: { body?: string } | null
  questions?: Array<{ id?: number | string; body?: string; plain_text_body?: string }>
  due_date?: string | null
  created_at?: string
  updated_at?: string
  private?: boolean
  assignees?: Array<{ id?: number | string }>
  assignee?: { id?: number | string } | null
  ball_in_court?: Array<{ id?: number | string }>
  rfi_manager?: { id?: number | string } | null
  created_by?: { id?: number | string; name?: string } | null
  [key: string]: unknown
}

function mapStatus(raw: RawProcoreRfi): TaskStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'closed':
      return 'closed'
    case 'draft':
      return 'open'
    case 'open':
      return 'in_progress'
    default:
      return 'open'
  }
}

function mapPriority(raw: RawProcoreRfi): TaskPriority | undefined {
  switch ((raw.priority ?? '').toLowerCase()) {
    case 'high':
    case 'urgent':
      return raw.priority?.toLowerCase() === 'urgent' ? 'urgent' : 'high'
    case 'medium':
    case 'normal':
      return 'medium'
    case 'low':
      return 'low'
    default:
      return undefined
  }
}

function description(raw: RawProcoreRfi): string | undefined {
  return pickStr(
    raw.body ??
      raw.question?.body ??
      raw.questions?.[0]?.plain_text_body ??
      raw.questions?.[0]?.body,
  )
}

function assigneeIds(raw: RawProcoreRfi): string[] {
  const ids = (raw.assignees ?? [])
    .map((a) => a.id)
    .concat(raw.assignee?.id != null ? [raw.assignee.id] : [])
    .filter((v): v is number | string => v != null)
    .map((v) => String(v))
  return Array.from(new Set(ids))
}

export function transformTask(raw: RawProcoreRfi, projectId?: string): Task {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    projectId: projectId ?? '',
    title: pickStr(raw.subject) ?? '',
    description: description(raw),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.due_date),
    assigneeIds: assigneeIds(raw),
    tagIds: [],
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'procore',
    metadata: strMap({
      platformType: 'rfi',
      number: raw.full_number ?? raw.number,
      status: raw.status,
      private: raw.private,
    }),
    raw,
  }
}
