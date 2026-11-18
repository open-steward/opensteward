/**
 * Talkdesk Case → canonical Ticket transform.
 *
 * Talkdesk Cases API field reference:
 *   id           — UUID string
 *   subject      — string (case title)
 *   status       — "new" | "open" | "pending" | "on_hold" | "resolved" | "closed"
 *   priority     — "low" | "normal" | "high" | "urgent"
 *   case_type    — "question" | "incident" | "problem" | "task"
 *   channel      — "phone" | "email" | "voicemail" | "chat" | "twitter" | "facebook" | "api"
 *   contact_id   — UUID string (requester)
 *   assignee_id  — UUID string | null
 *   team_id      — UUID string | null
 *   description  — string | null
 *   tags         — string[]
 *   created_at   — ISO-8601 string
 *   updated_at   — ISO-8601 string
 *   resolved_at  — ISO-8601 string | null
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTalkdeskCase {
  id: string
  subject?: string | null
  status?: string | null
  priority?: string | null
  case_type?: string | null
  channel?: string | null
  contact_id?: string | null
  assignee_id?: string | null
  team_id?: string | null
  description?: string | null
  tags?: string[] | null
  created_at?: string | null
  updated_at?: string | null
  resolved_at?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TicketStatus {
  switch (s) {
    case 'new':
    case 'open':
      return 'open'
    case 'pending':
      return 'pending'
    case 'on_hold':
      return 'on_hold'
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

function mapChannel(c: string | null | undefined): Channel {
  switch (c) {
    case 'email':
      return 'email'
    case 'chat':
      return 'chat'
    case 'phone':
    case 'voicemail':
    case 'callbar':
      return 'voice'
    case 'twitter':
    case 'facebook':
      return 'social'
    case 'sms':
      return 'sms'
    case 'api':
      return 'api'
    case 'web':
      return 'web'
    default:
      return 'other'
  }
}

export function transformTicket(raw: RawTalkdeskCase): Ticket {
  const status = mapStatus(raw.status)
  const resolvedAt = raw.resolved_at
    ? toIso(raw.resolved_at)
    : (status === 'resolved' || status === 'closed' ? toIso(raw.updated_at) : undefined)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: String(raw.id),
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapChannel(raw.channel),
    requesterId: pickStr(raw.contact_id) ?? '',
    assigneeId: pickStr(raw.assignee_id),
    teamId: pickStr(raw.team_id),
    tagIds: raw.tags ?? [],
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    resolvedAt,
    platform: 'talkdesk',
    metadata: strMap({
      rawChannel: raw.channel,
      caseType: raw.case_type,
    }),
    raw,
  }
}
