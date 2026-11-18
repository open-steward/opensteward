/**
 * LiveHelpNow ticket → canonical Ticket transform.
 *
 * Wire shape from GET /api/tickets and GET /api/ticket/{id}.
 * The list endpoint uses `status` (string) while the detail endpoint
 * exposes `status_id` (int) + `status_name` (string) — we normalise
 * both via mapStatus().
 *
 * Transforms NEVER throw; missing optional fields return undefined.
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Shape from GET /api/tickets (list) */
export interface RawLivehelpnowTicket {
  id: number
  title?: string
  body?: string
  status?: string
  status_id?: number
  status_name?: string
  priority?: string | null
  source?: string
  email?: string
  name?: string
  category?: string | null
  client_id?: number
  assigned_to?: number | null
  assigned_to_name?: string | null
  department_id?: string | null
  department_name?: string | null
  visitor_id?: string | null
  tags?: string[]
  has_attachments?: boolean
  acknowledged?: string | null
  created_time?: string
  updated_time?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined, statusId?: number): TicketStatus {
  // status_name from detail endpoint
  const norm = (s ?? '').toLowerCase()
  if (norm === 'open' || norm === 'new') return 'open'
  if (norm === 'pending') return 'pending'
  if (norm === 'in progress' || norm === 'in_progress') return 'in_progress'
  if (norm === 'on hold' || norm === 'on_hold' || norm === 'hold') return 'on_hold'
  if (norm === 'resolved' || norm === 'solved') return 'resolved'
  if (norm === 'closed') return 'closed'
  // fall back on numeric status_id (1=open,2=pending,3=resolved,4=closed)
  if (statusId === 1) return 'open'
  if (statusId === 2) return 'pending'
  if (statusId === 3) return 'resolved'
  if (statusId === 4) return 'closed'
  return 'open'
}

function mapPriority(p: string | null | undefined): TicketPriority | undefined {
  const norm = (p ?? '').toLowerCase()
  if (norm === 'low') return 'low'
  if (norm === 'normal' || norm === 'medium') return 'normal'
  if (norm === 'high') return 'high'
  if (norm === 'urgent' || norm === 'critical') return 'urgent'
  return undefined
}

function mapChannel(source: string | undefined): Channel {
  const norm = (source ?? '').toLowerCase()
  if (norm === 'email') return 'email'
  if (norm === 'chat' || norm === 'live chat') return 'chat'
  if (norm === 'phone' || norm === 'voice' || norm === 'callback') return 'voice'
  if (norm === 'web' || norm === 'web form') return 'web'
  if (norm === 'api') return 'api'
  if (norm === 'sms') return 'sms'
  return 'other'
}

export function transformTicket(raw: RawLivehelpnowTicket): Ticket {
  const status = mapStatus(raw.status ?? raw.status_name, raw.status_id)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: String(raw.id),
    subject: pickStr(raw.title) ?? pickStr(raw.body) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapChannel(raw.source),
    requesterId: pickStr(raw.email) ?? pickStr(raw.visitor_id) ?? '',
    assigneeId: raw.assigned_to ? String(raw.assigned_to) : undefined,
    teamId: pickStr(raw.department_id) ?? undefined,
    tagIds: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    createdAt: toIso(raw.created_time) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_time),
    resolvedAt: (status === 'resolved' || status === 'closed') ? toIso(raw.updated_time) : undefined,
    platform: 'livehelpnow',
    metadata: strMap({
      source: raw.source,
      category: raw.category,
      departmentName: raw.department_name,
      assignedToName: raw.assigned_to_name,
      acknowledged: raw.acknowledged,
      hasAttachments: raw.has_attachments,
    }),
    raw,
  }
}
