/**
 * Transform a raw Faveo Helpdesk ticket row into the canonical Ticket schema.
 *
 * Faveo ticket status is stored as an integer:
 *   1 = open, 2 = answered, 3 = resolved, 4 = closed
 * Source (channel) is also an integer:
 *   1 = web, 2 = email, 3 = API
 * Priority is stored by priority_id; the related priority object carries a name.
 *
 * The v3 GET v3/api/tickets endpoint returns a paginated `data` array; each element
 * matches RawFaveoTicket below.
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawFaveoTicket {
  id: number
  ticket_number?: string | null
  /** Ticket subject / title — comes from the first thread in some responses */
  title?: string | null
  /** Status as integer: 1=open, 2=answered, 3=resolved, 4=closed */
  status?: number | string | null
  /** priority object or string name returned by some endpoints */
  priority?: string | { name?: string } | null
  priority_id?: number | null
  /** Source/channel integer: 1=web, 2=email, 3=api */
  source?: number | string | null
  /** Customer user id */
  user_id?: number | null
  c_uid?: string | number | null
  /** Assigned agent id */
  assigned_to?: number | string | null
  /** Team id */
  team_id?: number | null
  /** Department id (maps to team in canonical model) */
  dept_id?: number | null
  /** Rating: 0 or a numeric value */
  rating?: number | null
  /** ISO-like datetime; Faveo stores in "YYYY-MM-DD HH:mm:ss" format */
  created_at?: string | null
  updated_at?: string | null
  closed_at?: string | null
  duedate?: string | null
  is_deleted?: number | null
  closed?: number | null
  [key: string]: unknown
}

/**
 * Faveo status integers: 1=open, 2=answered (pending), 3=resolved, 4=closed.
 * String form returned by the filter endpoint.
 */
function mapStatus(s: number | string | null | undefined): TicketStatus {
  const n = typeof s === 'string' ? parseInt(s, 10) : (s ?? 0)
  switch (n) {
    case 1:
      return 'open'
    case 2:
      return 'pending'
    case 3:
      return 'resolved'
    case 4:
      return 'closed'
    default:
      // string form from filter API
      if (s === 'open') return 'open'
      if (s === 'answered') return 'pending'
      if (s === 'resolved') return 'resolved'
      if (s === 'closed') return 'closed'
      return 'open'
  }
}

/**
 * Faveo priorities are flexible (admin-configured). We map common names.
 */
function mapPriority(raw: RawFaveoTicket): TicketPriority | undefined {
  let name: string | undefined
  if (typeof raw.priority === 'object' && raw.priority !== null) {
    name = pickStr((raw.priority as { name?: string }).name)
  } else {
    name = pickStr(raw.priority as string | undefined)
  }
  if (!name) return undefined
  const lower = name.toLowerCase()
  if (lower === 'low') return 'low'
  if (lower === 'normal' || lower === 'medium') return 'normal'
  if (lower === 'high') return 'high'
  if (lower === 'critical' || lower === 'urgent') return 'urgent'
  return undefined
}

/**
 * Faveo source integers: 1=web, 2=email, 3=api, 4=facebook, 5=twitter,
 * 6=phone, 7=chat, 8=instagram, 9=line, 10=whatsapp.
 */
function mapChannel(source: number | string | null | undefined): Channel {
  const n = typeof source === 'string' ? parseInt(source, 10) : (source ?? 0)
  switch (n) {
    case 1:
      return 'web'
    case 2:
      return 'email'
    case 3:
      return 'api'
    case 4:
    case 5:
      return 'social'
    case 6:
      return 'voice'
    case 7:
      return 'chat'
    case 8:
    case 9:
    case 10:
      return 'social'
    default:
      return 'other'
  }
}

export function transformTicket(raw: RawFaveoTicket): Ticket {
  const status = mapStatus(raw.status)

  // Requester id: v3 uses user_id; the filter endpoint may use c_uid
  const requesterId = String(raw.user_id ?? raw.c_uid ?? '')

  // Assignee: assigned_to field
  const assigneeId = raw.assigned_to ? String(raw.assigned_to) : undefined

  // Team: team_id takes precedence, fall back to dept_id
  const teamId = raw.team_id
    ? String(raw.team_id)
    : raw.dept_id
      ? String(raw.dept_id)
      : undefined

  // Satisfaction rating: stored as integer; treat > 0 as positive (5), 0 as unknown
  let satisfactionRating: number | undefined
  if (typeof raw.rating === 'number' && raw.rating > 0) {
    satisfactionRating = 5
  }

  const resolvedAt =
    status === 'resolved' || status === 'closed'
      ? toIso(raw.closed_at) ?? toIso(raw.updated_at)
      : undefined

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: pickStr(raw.ticket_number) ?? String(raw.id),
    subject: pickStr(raw.title) ?? '',
    status,
    priority: mapPriority(raw),
    channel: mapChannel(raw.source),
    requesterId,
    assigneeId,
    teamId,
    tagIds: [],
    satisfactionRating,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    resolvedAt,
    platform: 'faveo-helpdesk',
    metadata: strMap({
      ticketNumber: raw.ticket_number,
      source: raw.source,
      deptId: raw.dept_id,
      duedate: raw.duedate,
    }),
    raw,
  }
}
