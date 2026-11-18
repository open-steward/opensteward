/**
 * Pyrus task → canonical Ticket transform.
 *
 * Pyrus tasks do not have an explicit status field; "finished" is signalled
 * via comment action. We infer status from the `close_date` presence and
 * last comment action in the comments array.
 *
 * Pyrus tasks also lack a tags field — tagIds is always [].
 * Channel is always 'other' (Pyrus is a task/workflow tool, not a ticketing
 * channel in the traditional sense).
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawPyrusPerson {
  id?: number
  first_name?: string
  last_name?: string
  email?: string
  [key: string]: unknown
}

export interface RawPyrusComment {
  id?: number
  create_date?: string
  author?: RawPyrusPerson
  text?: string
  action?: string
  attachments?: Array<{ id?: number; name?: string }>
  [key: string]: unknown
}

export interface RawPyrusTask {
  id: number
  text?: string
  subject?: string
  create_date?: string
  last_modified_date?: string
  close_date?: string
  author?: RawPyrusPerson
  responsible?: RawPyrusPerson
  list_ids?: number[]
  parent_task_id?: number | null
  comments?: RawPyrusComment[]
  form_id?: number | null
  [key: string]: unknown
}

/**
 * Derive task status from presence of close_date and last comment action.
 * Pyrus marks tasks finished via action='finished' on a comment.
 */
function mapStatus(raw: RawPyrusTask): TicketStatus {
  if (raw.close_date) return 'closed'
  const comments = raw.comments ?? []
  const lastActionComment = [...comments].reverse().find((c) => c.action)
  if (lastActionComment?.action === 'finished') return 'resolved'
  if (lastActionComment?.action === 'reopened') return 'open'
  return 'open'
}

function mapChannel(): Channel {
  // Pyrus is a workflow/task tool; no channel concept
  return 'other'
}

export function transformTicket(raw: RawPyrusTask): Ticket {
  const status = mapStatus(raw)
  const resolvedAt = status === 'resolved' ? toIso(raw.last_modified_date) : undefined
  const closedAt = status === 'closed' ? toIso(raw.close_date ?? raw.last_modified_date) : undefined

  // subject = explicit subject field, else first line of text, else empty
  const subject = pickStr(raw.subject) ?? pickStr(raw.text?.split('\n')[0]) ?? ''

  const authorId = raw.author?.id != null ? String(raw.author.id) : ''
  const assigneeId = raw.responsible?.id != null ? String(raw.responsible.id) : undefined

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: String(raw.id),
    subject,
    status,
    priority: undefined,         // Pyrus has no priority field on tasks
    channel: mapChannel(),
    requesterId: authorId,
    assigneeId,
    teamId: undefined,           // Pyrus routing is list/step-based, not team-based
    tagIds: [],                  // Pyrus tasks have no tags
    parentTicketId: raw.parent_task_id ? String(raw.parent_task_id) : undefined,
    satisfactionRating: undefined,
    createdAt: toIso(raw.create_date) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.last_modified_date),
    resolvedAt,
    closedAt,
    platform: 'pyrus',
    metadata: strMap({
      formId: raw.form_id,
      listIds: raw.list_ids?.join(','),
    }),
    raw,
  }
}
