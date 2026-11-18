/**
 * Tiledesk request (ticket) transform.
 *
 * Tiledesk status codes (from official API docs):
 *   50   = TEMPORARY — pending/temporary state (pre-assignment)
 *   100  = UNSERVED  — created, waiting for an agent
 *   150  = ABANDONED — customer left before being served
 *   200  = SERVED    — actively handled by an agent
 *   1000 = CLOSED    — conversation ended
 *
 * Channel names from `channel.name`: chat21 (live chat widget), email,
 * form, whatsapp, telegram, messenger.
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTiledeskRequest {
  _id?: string
  request_id?: string
  ticket_id?: string | number
  first_text?: string
  status?: number
  priority?: string | null
  channel?: { name?: string } | null
  lead?: { _id?: string; fullname?: string; email?: string } | null
  requester?: { _id?: string } | null
  participants?: string[]
  participatingAgents?: Array<{ _id?: string }>
  department?: { _id?: string } | null
  tags?: Array<{ tag?: string; _id?: string } | string>
  rating?: number | null
  rating_message?: string | null
  createdAt?: string
  updatedAt?: string
  closed_at?: string | null
  assigned_at?: string | null
  id_project?: string
  [key: string]: unknown
}

function mapStatus(code: number | undefined): TicketStatus {
  switch (code) {
    case 50:
      return 'pending'     // TEMPORARY — pre-assignment hold
    case 100:
      return 'open'        // UNSERVED — waiting for an agent
    case 150:
      return 'pending'     // ABANDONED — customer left, on hold
    case 200:
      return 'in_progress' // SERVED — agent actively handling
    case 1000:
      return 'closed'      // CLOSED
    default:
      return 'open'
  }
}

function mapPriority(p: string | null | undefined): TicketPriority | undefined {
  if (p === 'low')    return 'low'
  if (p === 'normal') return 'normal'
  if (p === 'high')   return 'high'
  if (p === 'urgent') return 'urgent'
  return undefined
}

function mapChannel(name: string | undefined): Channel {
  switch (name) {
    case 'email':
      return 'email'
    case 'whatsapp':
    case 'telegram':
    case 'messenger':
      return 'social'
    case 'sms':
      return 'sms'
    case 'chat21':
    case 'form':
      return 'chat'
    default:
      return 'other'
  }
}

function extractTagIds(tags: RawTiledeskRequest['tags']): string[] {
  if (!tags || tags.length === 0) return []
  return tags.map((t) => {
    if (typeof t === 'string') return t
    return t.tag ?? t._id ?? ''
  }).filter(Boolean)
}

function mapRating(raw: RawTiledeskRequest): number | undefined {
  const r = raw.rating
  if (typeof r === 'number' && r >= 1 && r <= 5) return Math.round(r)
  return undefined
}

export function transformTicket(raw: RawTiledeskRequest): Ticket {
  const id = pickStr(raw._id) ?? pickStr(raw.request_id) ?? ''
  const status = mapStatus(raw.status)
  const channelName = raw.channel?.name
  const requesterId =
    pickStr(raw.lead?._id) ?? pickStr(raw.requester?._id) ?? ''
  const assigneeId =
    raw.participatingAgents && raw.participatingAgents.length > 0
      ? pickStr(raw.participatingAgents[0]?._id)
      : undefined
  const closedAt = toIso(raw.closed_at)

  return {
    id,
    externalId: pickStr(raw.request_id) ?? id,
    number: raw.ticket_id != null ? String(raw.ticket_id) : undefined,
    subject: pickStr(raw.first_text) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapChannel(channelName),
    requesterId,
    assigneeId,
    teamId: raw.department?._id ? String(raw.department._id) : undefined,
    tagIds: extractTagIds(raw.tags),
    satisfactionRating: mapRating(raw),
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updatedAt),
    resolvedAt: status === 'closed' ? (closedAt ?? toIso(raw.updatedAt)) : undefined,
    closedAt,
    platform: 'tiledesk',
    metadata: strMap({
      rawStatus: raw.status,
      rawChannel: channelName,
      idProject: raw.id_project,
    }),
    raw,
  }
}
