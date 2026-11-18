/**
 * Transforms a Libredesk conversation (ticket) into the canonical Ticket schema.
 *
 * Libredesk uses the term "conversation" internally. Statuses and priorities
 * are string names from the instance (e.g. "Open", "Resolved"). The
 * ConversationListItem and Conversation shapes are both handled here since the
 * list and single-get responses share the same fields we care about.
 *
 * Ref: internal/conversation/models/models.go (Conversation / ConversationListItem)
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawLibredeskConversation {
  id: number
  uuid: string
  reference_number?: string
  subject?: string | null
  status?: string | null
  priority?: string | null
  inbox_channel?: string
  contact_id?: number
  assigned_user_id?: number | null
  assigned_team_id?: number | null
  tags?: unknown
  csat_rating?: number | null
  created_at?: string
  updated_at?: string
  resolved_at?: string | null
  closed_at?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TicketStatus {
  const lower = (s ?? '').toLowerCase()
  switch (lower) {
    case 'open':
      return 'open'
    case 'replied':
      return 'open'
    case 'pending':
      return 'pending'
    case 'snoozed':
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
  const lower = (p ?? '').toLowerCase()
  if (lower === 'low') return 'low'
  if (lower === 'medium' || lower === 'normal') return 'normal'
  if (lower === 'high') return 'high'
  if (lower === 'urgent' || lower === 'critical') return 'urgent'
  return undefined
}

function mapChannel(c: string | undefined): Channel {
  switch ((c ?? '').toLowerCase()) {
    case 'email':
      return 'email'
    case 'chat':
    case 'live_chat':
    case 'widget':
      return 'chat'
    case 'api':
      return 'api'
    default:
      return 'other'
  }
}

function extractTagIds(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  return tags.map((t) => {
    if (typeof t === 'string') return t
    if (t && typeof t === 'object') {
      const name = (t as Record<string, unknown>)['name']
      if (name != null) return String(name)
    }
    return String(t)
  })
}

export function transformTicket(raw: RawLibredeskConversation): Ticket {
  const status = mapStatus(raw.status)
  const resolvedAt = raw.resolved_at
    ? toIso(raw.resolved_at)
    : raw.closed_at
      ? toIso(raw.closed_at)
      : status === 'resolved' || status === 'closed'
        ? toIso(raw.updated_at)
        : undefined

  return {
    id: String(raw.id),
    externalId: raw.uuid ?? String(raw.id),
    number: pickStr(raw.reference_number) ?? String(raw.id),
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapChannel(raw.inbox_channel),
    requesterId: raw.contact_id != null ? String(raw.contact_id) : '',
    assigneeId: raw.assigned_user_id != null ? String(raw.assigned_user_id) : undefined,
    teamId: raw.assigned_team_id != null ? String(raw.assigned_team_id) : undefined,
    tagIds: extractTagIds(raw.tags),
    satisfactionRating: raw.csat_rating != null ? Number(raw.csat_rating) : undefined,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    resolvedAt,
    platform: 'libredesk',
    metadata: strMap({ inboxChannel: raw.inbox_channel, referenceNumber: raw.reference_number }),
    raw,
  }
}
