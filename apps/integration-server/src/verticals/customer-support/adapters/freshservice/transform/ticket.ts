/**
 * Freshservice ticket transform.
 *
 * Freshservice ticket status is a numeric code:
 *   2 = Open  3 = Pending  4 = Resolved  5 = Closed
 *
 * Priority is a numeric code:
 *   1 = Low  2 = Medium (→ normal)  3 = High  4 = Urgent
 *
 * Source/channel codes:
 *   1=Email 2=Portal 3=Phone 4=Chat 5=Feedback Widget 6=YourSupportEmail
 *   7=Bot 8=API  9=FCR Form  10=Twitter/X  11=Facebook  12=WhatsApp
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawFreshserviceTicket {
  id: number
  subject?: string
  /** Numeric status code: 2=Open 3=Pending 4=Resolved 5=Closed */
  status?: number
  /** Numeric priority code: 1=Low 2=Medium 3=High 4=Urgent */
  priority?: number
  /** Numeric source code for channel of creation */
  source?: number
  requester_id?: number
  responder_id?: number | null
  group_id?: number | null
  tags?: string[]
  /** Satisfaction score from survey: 'happy' or 'unhappy' */
  fr_escalated?: boolean
  created_at?: string
  updated_at?: string
  /** ISO-8601 timestamp set by Freshservice when status transitions to Resolved */
  resolved_at?: string
  [key: string]: unknown
}

function mapStatus(s: number | undefined): TicketStatus {
  switch (s) {
    case 2:
      return 'open'
    case 3:
      return 'pending'
    case 4:
      return 'resolved'
    case 5:
      return 'closed'
    default:
      return 'open'
  }
}

function mapPriority(p: number | undefined): TicketPriority | undefined {
  switch (p) {
    case 1:
      return 'low'
    case 2:
      return 'normal'
    case 3:
      return 'high'
    case 4:
      return 'urgent'
    default:
      return undefined
  }
}

function mapChannel(source: number | undefined): Channel {
  switch (source) {
    case 1:
      return 'email'
    case 2:
      return 'web'
    case 3:
      return 'voice'
    case 4:
      return 'chat'
    case 8:
      return 'api'
    case 10:
    case 11:
    case 12:
      return 'social'
    default:
      return 'other'
  }
}

export function transformTicket(raw: RawFreshserviceTicket): Ticket {
  const status = mapStatus(raw.status)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: String(raw.id),
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapChannel(raw.source),
    requesterId: String(raw.requester_id ?? ''),
    assigneeId: raw.responder_id ? String(raw.responder_id) : undefined,
    teamId: raw.group_id ? String(raw.group_id) : undefined,
    tagIds: raw.tags ?? [],
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    resolvedAt: toIso(raw.resolved_at),
    platform: 'freshservice',
    metadata: strMap({ source: raw.source }),
    raw,
  }
}
