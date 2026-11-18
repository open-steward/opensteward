/**
 * Chaskiq conversation → canonical Ticket.
 *
 * Chaskiq calls them "conversations". State: open | pending | resolved.
 * Priority is a boolean (`priority` field) meaning "high priority" only.
 * Channels come from `conversation_channels` (array of provider strings).
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Raw shape returned by the GraphQL `conversations` query. */
export interface RawChaskiqConversation {
  id?: string | null
  key?: string | null
  subject?: string | null
  state?: string | null
  priority?: boolean | null
  created_at?: string | null
  closed_at?: string | null
  read_at?: string | null
  tag_list?: string[] | null
  conversation_channels?: string[] | null
  assignee?: { id?: string | null } | null
  main_participant?: { id?: string | null } | null
  [key: string]: unknown
}

function mapStatus(s: string | undefined | null): TicketStatus {
  switch (s) {
    case 'open':
      return 'open'
    case 'pending':
      return 'pending'
    case 'resolved':
      return 'resolved'
    case 'closed':
      return 'closed'
    default:
      return 'open'
  }
}

function mapChannel(channels: string[] | null | undefined): Channel {
  const first = channels?.[0]
  switch (first) {
    case 'email':
      return 'email'
    case 'chat':
    case 'messenger':
      return 'chat'
    case 'twitter':
    case 'facebook':
      return 'social'
    case 'sms':
    case 'whatsapp':
      return 'sms'
    case 'api':
      return 'api'
    case undefined:
    case null:
      return 'web'
    default:
      return 'other'
  }
}

export function transformTicket(raw: RawChaskiqConversation): Ticket {
  const status = mapStatus(raw.state)
  const id = pickStr(raw.id) ?? pickStr(raw.key) ?? ''
  return {
    id,
    externalId: id,
    number: pickStr(raw.key) ?? id,
    subject: pickStr(raw.subject) ?? '',
    status,
    priority: raw.priority ? 'high' : undefined,
    channel: mapChannel(raw.conversation_channels),
    requesterId: pickStr(raw.main_participant?.id) ?? '',
    assigneeId: raw.assignee?.id ? pickStr(raw.assignee.id) : undefined,
    teamId: undefined,
    tagIds: raw.tag_list ?? [],
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: undefined,
    resolvedAt: status === 'resolved' || status === 'closed'
      ? (toIso(raw.closed_at) ?? toIso(raw.read_at))
      : undefined,
    closedAt: toIso(raw.closed_at),
    platform: 'chaskiq',
    metadata: strMap({
      channels: (raw.conversation_channels ?? []).join(','),
      key: raw.key,
    }),
    raw,
  }
}
