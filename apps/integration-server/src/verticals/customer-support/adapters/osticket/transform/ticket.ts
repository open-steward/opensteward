/**
 * Transform an osTicket ticket response object into the canonical Ticket schema.
 *
 * Covers both TicketDetail (from GET /tickets-get.php/{number}.json) and
 * TicketSummary (from GET /tickets-search.php) since they share the same
 * top-level fields; TicketDetail also carries a `thread` array.
 *
 * Status vocabulary from osTicket is open/closed (extendable via Admin Panel);
 * we normalise by state: open-state → 'open', closed-state → 'closed'.
 * Priority is a numeric ID (1=low,2=normal,3=high,4=critical) or a name string.
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, pickNum, strMap, toIso } from './shared'

export interface RawOsticketTicket {
  id?: number
  number?: string
  subject?: string
  /** Status name e.g. "Open", "Closed", "Resolved" */
  status?: string
  statusId?: number
  /** State returned by tickets-statuses.php: "open" | "closed" */
  state?: string
  /** Priority name e.g. "Low", "Normal", "High", "Critical" */
  priority?: string
  priorityId?: number
  departmentId?: number
  department?: string | null
  topicId?: number
  topic?: string | null
  /** Internal DB user ID */
  userId?: number
  user?: { name?: string; email?: string } | null
  /** Assigned staff ID */
  staffId?: number | null
  staff?: string | null
  /** Assigned team ID */
  teamId?: number | null
  team?: string | null
  slaId?: number | null
  sla?: string | null
  /** Source channel: "Web", "Email", "API", "Phone", etc. */
  source?: string
  created?: string
  updated?: string | null
  duedate?: string | null
  dueDate?: string | null
  closed?: string | null
  isOverdue?: boolean
  isAnswered?: boolean
  children?: number[]
  /** Thread entries; present only on TicketDetail responses. */
  thread?: RawOsticketThreadEntry[]
  [key: string]: unknown
}

export interface RawOsticketThreadEntry {
  id?: number
  /** "message" | "response" | "note" */
  type?: string
  poster?: string
  timestamp?: string
  body?: string
  staffId?: number
  staff?: string
  userId?: number
  attachments?: Array<{ id?: number; file_id?: number; filename?: string }>
  attachment_count?: number
  [key: string]: unknown
}

function mapStatus(raw: RawOsticketTicket): TicketStatus {
  // Prefer explicit state field when present (values: "open" | "closed")
  const state = raw.state?.toLowerCase()
  if (state === 'closed') return 'closed'
  if (state === 'open') return 'open'

  // Fall back to status name
  const name = (raw.status ?? '').toLowerCase()
  if (name === 'closed') return 'closed'
  if (name.includes('resolv')) return 'resolved'
  if (name.includes('pend')) return 'pending'
  if (name.includes('hold')) return 'on_hold'
  return 'open'
}

function mapPriority(raw: RawOsticketTicket): TicketPriority | undefined {
  // Prefer name-based mapping
  const name = (raw.priority ?? '').toLowerCase()
  if (name === 'low') return 'low'
  if (name === 'normal') return 'normal'
  if (name === 'high') return 'high'
  if (name === 'critical' || name === 'urgent') return 'urgent'

  // Fall back to numeric ID (osTicket default: 1=low,2=normal,3=high,4=critical)
  const id = raw.priorityId
  if (id === 1) return 'low'
  if (id === 2) return 'normal'
  if (id === 3) return 'high'
  if (id === 4) return 'urgent'

  return undefined
}

function mapChannel(source: string | undefined): Channel {
  if (!source) return 'other'
  const s = source.toLowerCase()
  if (s === 'email') return 'email'
  if (s === 'web') return 'web'
  if (s === 'api') return 'api'
  if (s === 'phone') return 'voice'
  if (s === 'chat') return 'chat'
  if (s === 'sms') return 'sms'
  return 'other'
}

export function transformTicket(raw: RawOsticketTicket): Ticket {
  const status = mapStatus(raw)
  const closedAt = raw.closed ? toIso(raw.closed) : undefined
  const updatedAt = toIso(raw.updated ?? raw.dueDate)
  return {
    id: String(raw.id ?? raw.number ?? ''),
    externalId: pickStr(raw.number) ?? String(raw.id ?? ''),
    number: pickStr(raw.number) ?? String(raw.id ?? ''),
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: mapPriority(raw),
    channel: mapChannel(raw.source),
    // osTicket stores requester as userId / user.email
    requesterId: raw.userId ? String(raw.userId) : (raw.user?.email ?? ''),
    assigneeId: raw.staffId != null ? String(raw.staffId) : undefined,
    teamId: raw.teamId != null ? String(raw.teamId) : undefined,
    tagIds: [],
    parentTicketId: undefined,
    createdAt: toIso(raw.created) ?? new Date(0).toISOString(),
    updatedAt,
    resolvedAt: (status === 'resolved' || status === 'closed') ? (closedAt ?? updatedAt) : undefined,
    closedAt: status === 'closed' ? (closedAt ?? updatedAt) : undefined,
    platform: 'osticket',
    metadata: strMap({
      department: raw.department,
      topic: raw.topic,
      sla: raw.sla,
      staff: raw.staff,
      team: raw.team,
      isOverdue: raw.isOverdue,
      isAnswered: raw.isAnswered,
      duedate: raw.duedate ?? raw.dueDate,
      source: raw.source,
      departmentId: pickNum(raw.departmentId),
      topicId: pickNum(raw.topicId),
    }),
    raw,
  }
}
