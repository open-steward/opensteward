/**
 * Transforms an Omnidesk case object to the canonical Ticket schema.
 *
 * Omnidesk status values: "open" | "waiting" | "closed"
 * Omnidesk priority values: "low" | "normal" | "high" | "critical"
 * Omnidesk channel values: "email" | "web" | "call" | "chat" | "facebook" |
 *   "telegram" | "whatsapp" | "idea" | ...custom
 * Omnidesk rating values: "low" | "middle" | "high" (or absent)
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawOmnideskCase {
  case_id: number
  case_number?: string | null
  subject?: string
  status?: string
  priority?: string | null
  channel?: string
  user_id?: number | null
  staff_id?: number | null
  group_id?: number | null
  labels?: number[]
  locked_labels?: number[]
  parent_case_id?: number | null
  rating?: string | null
  rating_comment?: string | null
  rated_staff_id?: number | null
  created_at?: string
  updated_at?: string
  closed_at?: string | null
  last_response_at?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  switch (s) {
    case 'open':
      return 'open'
    case 'waiting':
      return 'pending'
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
  if (p === 'critical') return 'urgent'
  return undefined
}

function mapChannel(c: string | undefined): Channel {
  switch (c) {
    case 'email':
      return 'email'
    case 'chat':
      return 'chat'
    case 'call':
      return 'voice'
    case 'facebook':
    case 'telegram':
    case 'whatsapp':
      return 'social'
    case 'web':
      return 'web'
    default:
      return 'other'
  }
}

function mapRating(raw: RawOmnideskCase): number | undefined {
  // Omnidesk: "high" = good (5), "low" = bad (1), "middle" = average (3)
  if (raw.rating === 'high') return 5
  if (raw.rating === 'middle') return 3
  if (raw.rating === 'low') return 1
  return undefined
}

export function transformTicket(raw: RawOmnideskCase): Ticket {
  const status = mapStatus(raw.status)
  // labels are numeric IDs; store as string IDs
  const tagIds = (raw.labels ?? []).map(String)
  return {
    id: String(raw.case_id),
    externalId: String(raw.case_id),
    number: pickStr(raw.case_number) ?? String(raw.case_id),
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapChannel(raw.channel),
    requesterId: raw.user_id ? String(raw.user_id) : '',
    assigneeId: raw.staff_id ? String(raw.staff_id) : undefined,
    teamId: raw.group_id ? String(raw.group_id) : undefined,
    tagIds,
    parentTicketId: raw.parent_case_id ? String(raw.parent_case_id) : undefined,
    satisfactionRating: mapRating(raw),
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    resolvedAt: status === 'closed' ? (toIso(raw.closed_at) ?? toIso(raw.updated_at)) : undefined,
    closedAt: status === 'closed' ? (toIso(raw.closed_at) ?? toIso(raw.updated_at)) : undefined,
    platform: 'omnidesk',
    metadata: strMap({
      channel: raw.channel,
      ratingComment: raw.rating_comment,
      ratedStaffId: raw.rated_staff_id,
      lastResponseAt: raw.last_response_at,
    }),
    raw,
  }
}
