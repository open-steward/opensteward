import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'
import type { RawRichpanelComment } from './message'

export interface RawRichpanelTicket {
  id: string | number
  status?: string
  subject?: string
  priority?: string | null
  via?: { channel?: string }
  assignee_id?: string | number | null
  organization_id?: string | number | null
  recipient?: string | null
  tags?: string[]
  satisfaction_rating?: { score?: string; comment?: string } | null
  /** Comments/messages are embedded in the ticket object — no separate comments endpoint exists. */
  comments?: RawRichpanelComment[]
  created_at?: string
  updated_at?: string
  url?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  // Richpanel returns uppercase status values (OPEN, CLOSED, PENDING, etc.)
  // Normalise to lowercase before matching so both cases are handled.
  switch (typeof s === 'string' ? s.toLowerCase() : undefined) {
    case 'new':
    case 'open':
      return 'open'
    case 'pending':
      return 'pending'
    case 'hold':
    case 'on_hold':
      return 'on_hold'
    case 'solved':
    case 'resolved':
      return 'resolved'
    case 'closed':
      return 'closed'
    default:
      return 'open'
  }
}

function mapPriority(p: string | null | undefined): TicketPriority | undefined {
  if (p === 'low') return 'low'
  if (p === 'normal') return 'normal'
  if (p === 'high') return 'high'
  if (p === 'urgent') return 'urgent'
  return undefined
}

function mapChannel(c: string | undefined): Channel {
  switch (c) {
    case 'email':
      return 'email'
    case 'chat':
    case 'live_chat':
    case 'web_widget':
      return 'chat'
    case 'phone':
    case 'phone_call':
      return 'voice'
    case 'twitter':
    case 'facebook':
    case 'instagram':
      return 'social'
    case 'web':
    case 'web_service':
      return 'web'
    case 'sms':
      return 'sms'
    case 'api':
      return 'api'
    default:
      return 'other'
  }
}

function mapRating(raw: RawRichpanelTicket): number | undefined {
  const s = raw.satisfaction_rating?.score
  if (s === 'good') return 5
  if (s === 'bad') return 1
  return undefined
}

export function transformTicket(raw: RawRichpanelTicket): Ticket {
  const id = String(raw.id)
  const status = mapStatus(raw.status)
  return {
    id,
    externalId: id,
    number: id,
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapChannel(raw.via?.channel),
    requesterId: '',
    assigneeId: raw.assignee_id ? String(raw.assignee_id) : undefined,
    teamId: raw.organization_id ? String(raw.organization_id) : undefined,
    tagIds: raw.tags ?? [],
    satisfactionRating: mapRating(raw),
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    resolvedAt: status === 'resolved' || status === 'closed' ? toIso(raw.updated_at) : undefined,
    platform: 'richpanel',
    metadata: strMap({
      rawChannel: raw.via?.channel,
      recipient: raw.recipient,
      url: raw.url,
    }),
    raw,
  }
}
