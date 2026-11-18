import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawCustomerlyTicket {
  id: number
  external_id?: string | null
  subject?: string
  status?: string
  priority?: string | null
  via?: { channel?: string }
  requester_id?: number
  assignee_id?: number | null
  group_id?: number | null
  tags?: string[]
  problem_id?: number | null
  satisfaction_rating?: { score?: string } | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  switch (s) {
    case 'new':
    case 'open':
      return 'open'
    case 'pending':
      return 'pending'
    case 'hold':
      return 'on_hold'
    case 'solved':
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
    case 'native_messaging':
    case 'web_widget':
      return 'chat'
    case 'phone_call':
    case 'voice_api':
      return 'voice'
    case 'twitter':
    case 'facebook':
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

function mapRating(raw: RawCustomerlyTicket): number | undefined {
  const s = raw.satisfaction_rating?.score
  if (s === 'good') return 5
  if (s === 'bad') return 1
  return undefined
}

export function transformTicket(raw: RawCustomerlyTicket): Ticket {
  const status = mapStatus(raw.status)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: String(raw.id),
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapChannel(raw.via?.channel),
    requesterId: String(raw.requester_id ?? ''),
    assigneeId: raw.assignee_id ? String(raw.assignee_id) : undefined,
    teamId: raw.group_id ? String(raw.group_id) : undefined,
    tagIds: raw.tags ?? [],
    parentTicketId: raw.problem_id ? String(raw.problem_id) : undefined,
    satisfactionRating: mapRating(raw),
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    resolvedAt: status === 'resolved' || status === 'closed' ? toIso(raw.updated_at) : undefined,
    platform: 'customerly',
    metadata: strMap({ rawChannel: raw.via?.channel }),
    raw,
  }
}
